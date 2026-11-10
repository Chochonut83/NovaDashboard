/* Nova Peptide Research Dashboard — cloud connection (Firebase sign-in + Firestore).
   Gives the app the same small storage interface the earlier version used:
   db.doc(path).set/delete/onSnapshot and db.collection(path).onSnapshot.
   Nothing here writes on its own; it only writes when the app asks it to save a change. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection, setDoc, deleteDoc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const gate = document.getElementById('gate');
const say = html => { gate.hidden = false; document.getElementById('gate-body').innerHTML = html; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const cfg = window.NOVA_FIREBASE_CONFIG;
if (!cfg || !cfg.apiKey || /PASTE/i.test(cfg.apiKey)) {
  say(`<h2>One more setup step</h2><p>This app isn’t connected to your Firebase project yet.</p>
  <p>Open <b>firebase-config.js</b> in your GitHub repository and paste in the settings Firebase gave you (Step 3 of the setup guide).</p>`);
  throw new Error('Firebase config missing');
}

const app = initializeApp(cfg);
const auth = getAuth(app);
const fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

/* Rules text shown when the signed-in account has no access yet (filled in with that account's email). */
const rulesFor = email => `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email.lower() == "${String(email || '').toLowerCase()}";
    }
  }
}`;

let denied = false;
function showDenied() {
  if (denied) return; denied = true;
  const email = auth.currentUser?.email || '';
  say(`<h2>Almost there</h2>
  <p>You’re signed in as <b>${esc(email)}</b>, but your Firebase database isn’t open to this account yet.</p>
  <p>Copy the rules below, then in Firebase go to <b>Firestore Database → Rules</b>, replace everything, and tap <b>Publish</b>. Then reload this page.</p>
  <textarea id="rules-text" readonly rows="11">${esc(rulesFor(email))}</textarea>
  <button class="gbtn" id="copy-rules">Copy rules</button>
  <button class="glink" id="g-reload">Reload</button>
  <button class="glink" id="g-out">Use a different Google account</button>`);
  document.getElementById('copy-rules').onclick = async e => {
    const t = document.getElementById('rules-text');
    try { await navigator.clipboard.writeText(t.value); } catch (_) { t.select(); document.execCommand('copy'); }
    e.target.textContent = 'Copied ✓';
  };
  document.getElementById('g-reload').onclick = () => location.reload();
  document.getElementById('g-out').onclick = () => signOut(auth).then(() => location.reload());
}
const isDenied = e => e?.code === 'permission-denied';

/* Hold back an empty first snapshot that came only from this phone's cache, so a fresh install
   waits for the real data instead of briefly showing an empty app. */
function guardFirst(fn) {
  let first = true, timer = null;
  return snap => {
    if (first && snap.empty === true && snap.metadata?.fromCache) {
      if (!timer) timer = setTimeout(() => { first = false; fn(snap); }, 6000);
      return;
    }
    first = false; if (timer) { clearTimeout(timer); timer = null; } fn(snap);
  };
}
const wrapDoc = d => ({ id: d.id, get exists() { return d.exists(); }, data: () => d.data(), metadata: d.metadata });
const wrapCol = s => ({ docs: s.docs.map(wrapDoc), size: s.size, empty: s.empty, metadata: s.metadata });

/* A save goes into this phone's copy at once and syncs when online. Wait briefly for the server so a
   rejected save (e.g. no permission) is reported; if it is just slow or offline, carry on — it is queued. */
const settle = p => Promise.race([p, new Promise(r => setTimeout(r, 2500))]).catch(e => { if (isDenied(e)) showDenied(); throw e; });
const track = p => { p.catch(e => { console.warn('save', e); if (isDenied(e)) showDenied(); else window.novaSaveFailed?.(e); }); return p; };

const db = {
  doc: path => ({
    path,
    set: body => settle(track(setDoc(doc(fs, path), body))),
    delete: () => settle(track(deleteDoc(doc(fs, path)))),
    onSnapshot: (fn, err) => onSnapshot(doc(fs, path), d => fn(wrapDoc(d)), e => { if (isDenied(e)) showDenied(); err && err(e); })
  }),
  collection: path => ({
    path,
    onSnapshot: (fn, err) => onSnapshot(collection(fs, path), guardFirst(s => fn(wrapCol(s))), e => { if (isDenied(e)) showDenied(); err && err(e); })
  })
};

/* Files: receipts can be shared straight to Messages/WhatsApp; everything else downloads. */
const downloads = {
  async save({ filename, data }) {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const a = document.createElement('a'); const url = URL.createObjectURL(blob);
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { status: 'saved' };
  },
  async share({ filename, data, type }) {
    const file = new File([data], filename, { type: type || data.type || 'application/octet-stream' });
    if (!(navigator.canShare && navigator.canShare({ files: [file] }))) throw { code: 'unavailable' };
    try { await navigator.share({ files: [file], title: filename }); return { status: 'shared' }; }
    catch (e) { throw { code: e?.name === 'AbortError' ? 'declined' : 'unavailable' }; }
  }
};

window.NovaCloud = { signOut: () => signOut(auth).then(() => location.reload()), user: () => auth.currentUser };

let started = false;
function showSignIn(msg) {
  say(`<h2>Sign in</h2><p>Use the Google account you set up for Nova. Your records are stored privately in your own Firebase database.</p>
  ${msg ? `<div class="gerr">${esc(msg)}</div>` : ''}
  <button class="gbtn" id="g-in"><svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Sign in with Google</button>`);
  document.getElementById('g-in').onclick = async () => {
    try { await signInWithPopup(auth, provider); }
    catch (e) {
      if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') return signInWithRedirect(auth, provider);
      if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return;
      if (e?.code === 'auth/auth-domain-config-required') return showSignIn('This phone is still using old Firebase settings. Close the app, wait a minute and open it again (or clear this site’s data in Chrome).');
      if (e?.code === 'auth/operation-not-allowed') return showSignIn('Google sign-in isn’t turned on yet. In Firebase, go to Authentication → Sign-in method → Google → Enable.');
      if (e?.code === 'auth/unauthorized-domain') return showSignIn('This web address isn’t allowed to sign in yet. In Firebase, go to Authentication → Settings → Authorized domains and add ' + location.hostname + '.');
      showSignIn('Sign-in didn’t work (' + (e?.code || 'error') + '). Check your connection and try again.');
    }
  };
}
getRedirectResult(auth).catch(e => console.warn('redirect', e));
onAuthStateChanged(auth, user => {
  if (!user) { if (started) location.reload(); else showSignIn(); return; }
  if (started) return; started = true;
  gate.hidden = true;
  window.__novaCloudResolve({ db, downloads, user });
});

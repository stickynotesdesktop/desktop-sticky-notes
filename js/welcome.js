// Welcome page: one column of steps, each step is a heading with a picture under it.
// Two modes on one page:
//   "pin"   — the extension icon is hidden under the puzzle menu: the page starts with how to pin it;
//   "usage" — the icon is already on the toolbar: the pin step is hidden.
//
// The same file runs in two places:
//   1) inside the extension (chrome-extension://<id>/welcome.html) — it talks to the
//      background script with chrome.runtime.sendMessage(msg);
//   2) on the website (index.html on your hosting) — it talks to the extension with
//      chrome.runtime.sendMessage(<extension id>, msg). This works only because the
//      site address is listed in "externally_connectable" in manifest.json.
//
// Which mode is shown, from the strongest rule to the weakest:
//   1. The user's choice: a switch link was clicked or the page was opened with #pin / #usage.
//   2. The live answer of the extension: we ask "are you pinned?" every 1.5 s and when the tab
//      becomes visible again.
//   3. The hint in the link: ?pinned=1 or ?pinned=0 (what the extension saw at install time).
//   4. By default: the pin guide.
(function () {
  'use strict';

  // ID of the extension in the Chrome Web Store. Fill it in after publishing: it is used only
  // when the site is opened without ?id=... in the link (for example, from a bookmark).
  var STORE_EXTENSION_ID = '';
  var POLL_INTERVAL_MS = 1500;

  var IN_EXTENSION = location.protocol === 'chrome-extension:';
  var params = new URLSearchParams(location.search);
  var linkId = params.get('id') || '';
  var extensionId = IN_EXTENSION ? '' : (/^[a-p]{32}$/.test(linkId) ? linkId : STORE_EXTENSION_ID);

  var manual = false;     // the user picked a mode by hand: no more automatic switching
  var reachable = true;   // the extension answers our messages
  var pollTimer = 0;
  var lastLive = null;    // the last live answer: true / false / null

  // ---------------- texts ----------------
  var W = {
    en: {
      docTitle: 'Desktop Sticky Notes Installed',
      installed: 'Desktop Sticky Notes Installed',
      thankYou: 'Thank You!',
      pinLead: 'Click the puzzle piece (1) in the top right of your browser. Then, click the little pin (2) next to the extension:',
      liveHint: 'This page will update automatically as soon as you pin the icon.',
      toUsageQ: 'Already pinned?', toUsage: 'Skip this step',
      pinnedLine: 'Desktop Sticky Notes is already pinned to your toolbar.',
      toPinQ: 'Don’t see the icon on your toolbar?', toPin: 'Show me how to pin it',
      openLead: 'Open the extension (3) to start using Desktop Sticky Notes:',
      newLead: 'Click <b>+ New note</b> (4). A new note opens in its own window:',
      firstNote: 'Create your first note',
      pressToCreate: 'Or press {newNote} to create a note.',
      typeH: 'Just start typing',
      typeB: 'There is no Save button: everything is saved automatically. The first line becomes the title.',
      topH: 'Keep it on top',
      topB: 'Click <b>Always on top</b>, and the note stays above Word, Excel, and any other app.',
      findH: 'Find any note',
      findB: 'Open <b>All notes &amp; folders</b> to search, sort, and organize your notes into folders.',
      keysTitle: 'Keyboard shortcuts on this computer',
      kNew: 'New note (while Chrome is active)',
      kAny: 'New note from any app (Chrome must be running)',
      kMenu: 'Open the extension menu',
      kSearch: 'Search inside a note',
      kSub: 'Indent a list item / move to the next table cell',
      kPaste: 'Paste a screenshot into a note',
      keysTip: 'You can change the shortcuts on this Chrome page:',
      tipsTitle: 'Good to know',
      tipSpell: 'Spelling is checked automatically in English, Spanish, French and German (and Russian). Mistakes get a red wavy underline, like in Word; right-click a word to see suggestions.',
      tipDesktop: 'Chrome doesn’t allow extensions to add an icon to your desktop or taskbar. To create a note quickly from anywhere, press {anywhere}. It works even in Word or Excel while Chrome is running.',
      toast: 'Done! The icon is on your toolbar.',
      sNewTab: 'Google', sSearch: 'Search Google or type a URL', sExt: 'Extensions', sFull: 'Full access',
      picNote: 'This is a picture of the <b>Google Chrome</b> browser. The red circles only show where to click: they are not buttons. Click the real buttons on <b>your own browser toolbar</b>, in the top right corner of this window ↗',
      sOther: 'Another extension', sManage: 'Manage extensions', sNewNote: 'New note',
      altPin: 'The Extensions menu in Chrome with the pin button next to Desktop Sticky Notes',
      altOpen: 'The Desktop Sticky Notes menu opened from the toolbar',
      altNote: 'A new empty note in its own window',
      altType: 'A note with a shopping list',
      altTop: 'The Always on top button with its tooltip',
      altFind: 'All notes with search',
    },
    es: {
      docTitle: 'Desktop Sticky Notes instalado',
      installed: 'Desktop Sticky Notes instalado',
      thankYou: '¡Gracias!',
      pinLead: 'Haz clic en la pieza de puzle (1) arriba a la derecha del navegador. Después, haz clic en la chincheta (2) junto a la extensión:',
      liveHint: 'Esta página se actualizará sola en cuanto fijes el icono.',
      toUsageQ: '¿Ya lo has fijado?', toUsage: 'Saltar este paso',
      pinnedLine: 'Desktop Sticky Notes ya está fijado en tu barra de herramientas.',
      toPinQ: '¿No ves el icono en la barra?', toPin: 'Enséñame cómo fijarlo',
      openLead: 'Abre la extensión (3) para empezar a usar Desktop Sticky Notes:',
      newLead: 'Haz clic en <b>+ Nueva nota</b> (4). La nota se abre en su propia ventana:',
      firstNote: 'Crea tu primera nota',
      pressToCreate: 'O pulsa {newNote} para crear una nota.',
      typeH: 'Empieza a escribir',
      typeB: 'No hay botón de guardar: todo se guarda automáticamente. La primera línea se convierte en el título.',
      topH: 'Mantenla siempre visible',
      topB: 'Haz clic en <b>Siempre visible</b> y la nota se queda por encima de Word, Excel y cualquier otra aplicación.',
      findH: 'Encuentra cualquier nota',
      findB: 'Abre <b>Todas las notas y carpetas</b> para buscar, ordenar y organizar tus notas en carpetas.',
      keysTitle: 'Atajos de teclado en este ordenador',
      kNew: 'Nueva nota (con Chrome activo)',
      kAny: 'Nueva nota desde cualquier aplicación (Chrome debe estar abierto)',
      kMenu: 'Abrir el menú de la extensión',
      kSearch: 'Buscar dentro de una nota',
      kSub: 'Sangrar un elemento de lista / ir a la siguiente celda de la tabla',
      kPaste: 'Pegar una captura de pantalla en una nota',
      keysTip: 'Puedes cambiar los atajos en esta página de Chrome:',
      tipsTitle: 'Conviene saber',
      tipSpell: 'La ortografía se revisa automáticamente en español, inglés, francés y alemán (y ruso): los errores se subrayan con una línea roja ondulada, como en Word, y con clic derecho ves sugerencias.',
      tipDesktop: 'Chrome no permite a las extensiones poner un icono en el escritorio ni en la barra de tareas. Para crear una nota rápidamente desde cualquier sitio, pulsa {anywhere}. Funciona incluso en Word o Excel mientras Chrome está abierto.',
      toast: '¡Listo! El icono está en tu barra.',
      sNewTab: 'Google', sSearch: 'Busca con Google o escribe una URL', sExt: 'Extensiones', sFull: 'Acceso completo',
      picNote: 'Esto es una imagen del navegador <b>Google Chrome</b>. Los círculos rojos solo indican dónde hacer clic: no son botones. Haz clic en los botones reales de <b>la barra de tu propio navegador</b>, arriba a la derecha de esta ventana ↗',
      sOther: 'Otra extensión', sManage: 'Gestionar extensiones', sNewNote: 'Nueva nota',
      altPin: 'El menú de extensiones de Chrome con la chincheta junto a Desktop Sticky Notes',
      altOpen: 'El menú de Desktop Sticky Notes abierto desde la barra',
      altNote: 'Una nota nueva y vacía en su propia ventana',
      altType: 'Una nota con la lista de la compra',
      altTop: 'El botón Siempre visible con su descripción',
      altFind: 'Todas las notas con la búsqueda',
    },
    fr: {
      docTitle: 'Desktop Sticky Notes est installé',
      installed: 'Desktop Sticky Notes est installé',
      thankYou: 'Merci !',
      pinLead: 'Cliquez sur la pièce de puzzle (1) en haut à droite du navigateur. Puis cliquez sur la petite punaise (2) à côté de l’extension :',
      liveHint: 'Cette page se mettra à jour toute seule dès que vous aurez épinglé l’icône.',
      toUsageQ: 'Déjà épinglée ?', toUsage: 'Passer cette étape',
      pinnedLine: 'Desktop Sticky Notes est déjà épinglé dans votre barre d’outils.',
      toPinQ: 'Vous ne voyez pas l’icône dans la barre ?', toPin: 'Montrez-moi comment l’épingler',
      openLead: 'Ouvrez l’extension (3) pour commencer à utiliser Desktop Sticky Notes :',
      newLead: 'Cliquez sur <b>+ Nouvelle note</b> (4). La note s’ouvre dans sa propre fenêtre :',
      firstNote: 'Créer ma première note',
      pressToCreate: 'Ou appuyez sur {newNote} pour créer une note.',
      typeH: 'Commencez à écrire',
      typeB: 'Il n’y a pas de bouton Enregistrer : tout est enregistré automatiquement. La première ligne devient le titre.',
      topH: 'Gardez-la au premier plan',
      topB: 'Cliquez sur <b>Toujours au premier plan</b> et la note reste au-dessus de Word, Excel et de toute autre application.',
      findH: 'Retrouvez n’importe quelle note',
      findB: 'Ouvrez <b>Toutes les notes et dossiers</b> pour rechercher, trier et ranger vos notes dans des dossiers.',
      keysTitle: 'Raccourcis clavier sur cet ordinateur',
      kNew: 'Nouvelle note (quand Chrome est actif)',
      kAny: 'Nouvelle note depuis n’importe quelle application (Chrome doit être ouvert)',
      kMenu: 'Ouvrir le menu de l’extension',
      kSearch: 'Rechercher dans une note',
      kSub: 'Décaler un élément de liste / passer à la cellule suivante du tableau',
      kPaste: 'Coller une capture d’écran dans une note',
      keysTip: 'Vous pouvez modifier les raccourcis sur cette page de Chrome :',
      tipsTitle: 'Bon à savoir',
      tipSpell: 'L’orthographe est vérifiée automatiquement en français, anglais, espagnol et allemand (et russe) : les fautes sont soulignées d’une ligne rouge ondulée, comme dans Word, et un clic droit propose des corrections.',
      tipDesktop: 'Chrome ne permet pas aux extensions d’ajouter une icône sur le bureau ou dans la barre des tâches. Pour créer une note rapidement depuis n’importe où, appuyez sur {anywhere}. Cela marche même dans Word ou Excel tant que Chrome est ouvert.',
      toast: 'C’est fait ! L’icône est dans votre barre.',
      sNewTab: 'Google', sSearch: 'Rechercher sur Google ou saisir une URL', sExt: 'Extensions', sFull: 'Accès complet',
      picNote: 'Ceci est une image du navigateur <b>Google Chrome</b>. Les cercles rouges indiquent seulement où cliquer : ce ne sont pas des boutons. Cliquez sur les vrais boutons de <b>la barre de votre propre navigateur</b>, en haut à droite de cette fenêtre ↗',
      sOther: 'Autre extension', sManage: 'Gérer les extensions', sNewNote: 'Nouvelle note',
      altPin: 'Le menu des extensions de Chrome avec la punaise à côté de Desktop Sticky Notes',
      altOpen: 'Le menu de Desktop Sticky Notes ouvert depuis la barre',
      altNote: 'Une nouvelle note vide dans sa propre fenêtre',
      altType: 'Une note avec une liste de courses',
      altTop: 'Le bouton Toujours au premier plan avec son info-bulle',
      altFind: 'Toutes les notes avec la recherche',
    },
    de: {
      docTitle: 'Desktop Sticky Notes ist installiert',
      installed: 'Desktop Sticky Notes ist installiert',
      thankYou: 'Danke!',
      pinLead: 'Klicke oben rechts im Browser auf das Puzzleteil (1). Klicke dann auf die kleine Pinnnadel (2) neben der Erweiterung:',
      liveHint: 'Diese Seite aktualisiert sich von selbst, sobald du das Symbol angeheftet hast.',
      toUsageQ: 'Schon angeheftet?', toUsage: 'Diesen Schritt überspringen',
      pinnedLine: 'Desktop Sticky Notes ist bereits an deiner Symbolleiste angeheftet.',
      toPinQ: 'Du siehst das Symbol nicht in der Leiste?', toPin: 'Zeig mir, wie ich es anhefte',
      openLead: 'Öffne die Erweiterung (3), um Desktop Sticky Notes zu nutzen:',
      newLead: 'Klicke auf <b>+ Neue Notiz</b> (4). Die Notiz öffnet sich in einem eigenen Fenster:',
      firstNote: 'Erste Notiz erstellen',
      pressToCreate: 'Oder drücke {newNote}, um eine Notiz zu erstellen.',
      typeH: 'Einfach losschreiben',
      typeB: 'Es gibt keinen Speichern-Knopf: Alles wird automatisch gespeichert. Die erste Zeile wird zum Titel.',
      topH: 'Immer im Blick',
      topB: 'Klicke auf <b>Immer im Vordergrund</b>, und die Notiz bleibt über Word, Excel und jeder anderen App.',
      findH: 'Jede Notiz wiederfinden',
      findB: 'Öffne <b>Alle Notizen & Ordner</b>, um deine Notizen zu suchen, zu sortieren und in Ordnern zu ordnen.',
      keysTitle: 'Tastenkürzel auf diesem Computer',
      kNew: 'Neue Notiz (wenn Chrome aktiv ist)',
      kAny: 'Neue Notiz aus jeder App (Chrome muss laufen)',
      kMenu: 'Menü der Erweiterung öffnen',
      kSearch: 'In einer Notiz suchen',
      kSub: 'Listenpunkt einrücken / zur nächsten Tabellenzelle',
      kPaste: 'Screenshot in eine Notiz einfügen',
      keysTip: 'Die Tastenkürzel kannst du auf dieser Chrome-Seite ändern:',
      tipsTitle: 'Gut zu wissen',
      tipSpell: 'Die Rechtschreibung wird automatisch auf Deutsch, Englisch, Spanisch und Französisch (und Russisch) geprüft: Fehler bekommen eine rote Wellenlinie wie in Word, und ein Rechtsklick zeigt Vorschläge.',
      tipDesktop: 'Chrome erlaubt Erweiterungen nicht, ein Symbol auf den Desktop oder in die Taskleiste zu legen. Um schnell von überall eine Notiz zu erstellen, drücke {anywhere}. Das funktioniert sogar in Word oder Excel, solange Chrome läuft.',
      toast: 'Fertig! Das Symbol ist in deiner Leiste.',
      sNewTab: 'Google', sSearch: 'Google durchsuchen oder URL eingeben', sExt: 'Erweiterungen', sFull: 'Vollzugriff',
      picNote: 'Das ist ein Bild des Browsers <b>Google Chrome</b>. Die roten Kreise zeigen nur, wohin du klicken sollst: Es sind keine Knöpfe. Klicke auf die echten Knöpfe in <b>der Leiste deines eigenen Browsers</b>, oben rechts in diesem Fenster ↗',
      sOther: 'Andere Erweiterung', sManage: 'Erweiterungen verwalten', sNewNote: 'Neue Notiz',
      altPin: 'Das Erweiterungsmenü von Chrome mit der Pinnnadel neben Desktop Sticky Notes',
      altOpen: 'Das Menü von Desktop Sticky Notes, geöffnet über die Leiste',
      altNote: 'Eine neue, leere Notiz in einem eigenen Fenster',
      altType: 'Eine Notiz mit einer Einkaufsliste',
      altTop: 'Der Knopf „Immer im Vordergrund“ mit seinem Hinweis',
      altFind: 'Alle Notizen mit der Suche',
    },
  };
  // Russian is not offered on the Welcome page (build 18): a Russian browser gets the English page
  var LANGS = ['en', 'es', 'fr', 'de'];
  // Pictures of the real extension in every language of the page (build 20: the note windows too)
  var SHOT_LANGS = { popup: LANGS, library: LANGS, note: LANGS, ontop: LANGS, 'note-empty': LANGS };

  // Default shortcuts (the same as in manifest.json). The extension sends the real ones if it is reachable.
  var shortcuts = { newNote: 'Alt+Shift+N', newNoteAnywhere: 'Ctrl+Shift+9', openMenu: 'Alt+Shift+S' };

  var uaPlatform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  var isMac = /mac/i.test(uaPlatform) || /Mac OS X/.test(navigator.userAgent);
  var os = params.get('os') === 'mac' || params.get('os') === 'win' ? params.get('os') : (isMac ? 'mac' : 'win');
  var lang = 'en';

  var $ = function (id) { return document.getElementById(id); };
  function w(k) { return (W[lang] && W[lang][k] != null) ? W[lang][k] : W.en[k]; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // ---------------- keyboard keys ----------------
  var MAC_KEYS = { Alt: '⌥ Option', Shift: '⇧ Shift', Ctrl: '⌘ Cmd', Command: '⌘ Cmd', MacCtrl: '⌃ Control', Tab: '⇥ Tab' };
  var WIN_KEYS = { Command: 'Ctrl', MacCtrl: 'Ctrl' };
  function keys(combo) {
    return String(combo).split('+').map(function (k) {
      var name = (os === 'mac' ? MAC_KEYS[k] : WIN_KEYS[k]) || k;
      return '<span class="kbd">' + name + '</span>';
    }).join('<span class="kbd-plus">+</span>');
  }
  function fill(s) {
    return String(s).replace('{newNote}', keys(shortcuts.newNote)).replace('{anywhere}', keys(shortcuts.newNoteAnywhere));
  }

  // ---------------- talking to the extension ----------------
  // Resolves with the answer, or with null when the extension can't be reached.
  function ask(msg) {
    return new Promise(function (resolve) {
      var runtime = window.chrome && chrome.runtime;
      // On the website chrome.runtime.sendMessage exists only thanks to externally_connectable.
      if (!runtime || typeof runtime.sendMessage !== 'function' || (!IN_EXTENSION && !extensionId)) { resolve(null); return; }
      var done = function (reply) {
        if (runtime.lastError) { resolve(null); return; } // not installed, disabled or an old version
        resolve(reply == null ? null : reply);
      };
      try {
        if (IN_EXTENSION) runtime.sendMessage(msg, done);
        else runtime.sendMessage(extensionId, msg, done);
      } catch (e) { resolve(null); }
    });
  }

  // ---------------- modes ----------------
  function setMode(mode, auto) {
    if (mode !== 'pin' && mode !== 'usage') return;
    var before = document.body.dataset.mode;
    document.body.dataset.mode = mode;
    if (auto && before === 'pin' && mode === 'usage') showToast();
  }

  function stopPolling() { clearInterval(pollTimer); pollTimer = 0; }

  // Ask the extension whether its icon is on the toolbar right now.
  function checkPinState() {
    if (manual || !reachable) return;
    ask({ type: 'getPinState' }).then(function (reply) {
      if (!reply) { reachable = false; stopPolling(); $('liveHint').hidden = true; return; }
      $('liveHint').hidden = false;
      if (manual || typeof reply.isOnToolbar !== 'boolean') return;
      lastLive = reply.isOnToolbar;
      setMode(reply.isOnToolbar ? 'usage' : 'pin', true);
    });
  }

  var toastTimer = 0;
  function showToast() {
    var t = $('pinnedToast');
    t.textContent = w('toast');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 5000);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------- pictures: a Chrome window drawn in SVG ----------------
  var FONT = 'font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"';
  var MARK = '#D93025';
  var ICON32 = 'icons/icon32.png';
  var shotBase = function (k) { var l = (SHOT_LANGS[k] || ['en']).indexOf(lang) >= 0 ? lang : 'en'; return 'images/welcome/' + l + '/'; };

  // Material "extension" (puzzle) and "push pin" icons, 24x24
  var PUZZLE = 'M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z';
  var PIN = 'M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z';
  var SEARCH = 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z';
  // The word "Google" in its colors, centered at x, baseline y
  function googleLogo(x, y) {
    var letters = [['G', '#4285F4'], ['o', '#EA4335'], ['o', '#FBBC05'], ['g', '#4285F4'], ['l', '#34A853'], ['e', '#EA4335']];
    return '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-size="40" font-weight="500" letter-spacing="-1" font-family="Product Sans, Google Sans, Arial, Helvetica, sans-serif">' +
      letters.map(function (l) { return '<tspan fill="' + l[1] + '">' + l[0] + '</tspan>'; }).join('') + '<title>Google</title></text>';
  }
  // Small round "G" (Google favicon) on the tab
  function gIcon(cx, cy, r) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r + 1.5) + '" fill="#fff"/>' +
      '<text x="' + cx + '" y="' + (cy + 4.5) + '" text-anchor="middle" font-size="' + (r * 1.9) + '" font-weight="700" fill="#4285F4" font-family="Arial, Helvetica, sans-serif">G</text>';
  }
  function icon(path, x, y, size, color) {
    var k = size / 24;
    return '<path d="' + path + '" fill="' + color + '" transform="translate(' + (x - size / 2) + ' ' + (y - size / 2) + ') scale(' + k + ')"/>';
  }
  function marker(n, x, y) {
    return '<g class="mk">' +
      '<circle cx="' + x + '" cy="' + y + '" r="23" fill="#FDECEC" stroke="' + MARK + '" stroke-width="2.5"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="17.5" fill="#fff" stroke="' + MARK + '" stroke-width="1.5"/>' +
      '<text x="' + x + '" y="' + (y + 7.5) + '" text-anchor="middle" font-size="21" font-weight="800" fill="#B3261E" ' + FONT + '>' + n + '</text></g>';
  }
  function arrow(x1, y1, x2, y2, bend) {
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + (bend || 0);
    return '<path d="M' + x1 + ' ' + y1 + ' Q' + mx + ' ' + my + ' ' + x2 + ' ' + y2 + '" fill="none" stroke="' + MARK + '" stroke-width="2.5" stroke-linecap="round" marker-end="url(#ah)"/>';
  }
  function ring(x, y, r) {
    return '<circle class="pulse" cx="' + x + '" cy="' + y + '" r="' + r + '" fill="none" stroke="' + MARK + '" stroke-width="2.5"/>';
  }

  // A Chrome window: tab strip, toolbar (with or without our pinned icon) and a simple new tab page.
  function chromeWindow(h, pinned, overlay, ntpX) {
    var cx = ntpX || 340; var bw = ntpX ? 300 : 340;
    var mac = os === 'mac';
    var tabX = mac ? 78 : 10;
    var s = '<svg viewBox="0 0 680 ' + h + '" xmlns="http://www.w3.org/2000/svg" role="img">' +
      '<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="' + MARK + '"/></marker>' +
      '<filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="7" flood-color="#1F2937" flood-opacity=".22"/></filter>' +
      '<clipPath id="pop"><rect x="0" y="0" width="1000" height="1000" rx="10"/></clipPath></defs>' +
      '<rect width="680" height="' + h + '" fill="#fff"/>' +
      '<rect width="680" height="42" fill="#DDE7F8"/>';
    if (mac) s += '<circle cx="22" cy="21" r="6" fill="#FF5F57"/><circle cx="42" cy="21" r="6" fill="#FEBC2E"/><circle cx="62" cy="21" r="6" fill="#28C840"/>';
    s += '<path d="M' + tabX + ' 42 V18 Q' + tabX + ' 8 ' + (tabX + 10) + ' 8 H' + (tabX + 192) + ' Q' + (tabX + 202) + ' 8 ' + (tabX + 202) + ' 18 V42 Z" fill="#fff"/>' +
      gIcon(tabX + 22, 25, 7) +
      '<text x="' + (tabX + 36) + '" y="30" font-size="12.5" fill="#3C4043" ' + FONT + '>' + esc(w('sNewTab')) + '</text>' +
      '<text x="' + (tabX + 184) + '" y="30" font-size="13" fill="#5F6368" ' + FONT + '>×</text>' +
      '<text x="' + (tabX + 218) + '" y="31" font-size="18" fill="#3C4043" ' + FONT + '>+</text>';
    if (!mac) s += '<text x="574" y="27" font-size="13" fill="#3C4043" ' + FONT + '>—</text><rect x="608" y="16" width="10" height="10" fill="none" stroke="#3C4043" stroke-width="1.2"/><text x="645" y="27" font-size="14" fill="#3C4043" ' + FONT + '>✕</text>';
    var omniRight = pinned ? 548 : 580;
    s += '<rect y="42" width="680" height="46" fill="#fff"/><line x1="0" y1="88" x2="680" y2="88" stroke="#E5E7EB"/>' +
      '<text x="14" y="71" font-size="17" fill="#5F6368" ' + FONT + '>←</text><text x="40" y="71" font-size="17" fill="#B0B4BA" ' + FONT + '>→</text><text x="66" y="71" font-size="16" fill="#5F6368" ' + FONT + '>↻</text>' +
      '<rect x="94" y="51" width="' + (omniRight - 94) + '" height="30" rx="15" fill="#F1F3F4"/>' +
      '<text x="114" y="71" font-size="12.5" fill="#5F6368" ' + FONT + '>' + esc(w('sSearch')) + '</text>';
    if (pinned) s += '<image href="' + ICON32 + '" x="561" y="55" width="22" height="22"><title>Desktop Sticky Notes</title></image>';
    s += icon(PUZZLE, 604, 66, 19, '#5F6368') +
      '<circle cx="634" cy="66" r="11" fill="#A8C7FA"/><circle cx="634" cy="62" r="4" fill="#fff"/><path d="M626.5 73 a8 6 0 0 1 15 0" fill="#fff"/>' +
      '<circle cx="662" cy="59" r="1.8" fill="#5F6368"/><circle cx="662" cy="66" r="1.8" fill="#5F6368"/><circle cx="662" cy="73" r="1.8" fill="#5F6368"/>';
    // new tab page: the Google logo and the Google search box, so it is clear that this is a browser
    var bx = cx - bw / 2;
    s += googleLogo(cx, h * 0.48 - 16) +
      '<rect x="' + bx + '" y="' + (h * 0.48) + '" width="' + bw + '" height="42" rx="21" fill="#fff" stroke="#DADCE0"/>' +
      icon(SEARCH, bx + 24, h * 0.48 + 21, 17, '#9AA0A6') +
      '<text x="' + (bx + 42) + '" y="' + (h * 0.48 + 26) + '" font-size="13" fill="#80868B" ' + FONT + '>' + esc(w('sSearch')) + '</text>' +
      [0, 1, 2, 3].map(function (i) { return '<circle cx="' + (cx - 78 + i * 52) + '" cy="' + (h * 0.48 + 92) + '" r="20" fill="#F1F3F4"/>'; }).join('');
    return s + (overlay || '') + '</svg>';
  }

  function picPin() {
    var mx = 362, my = 94, mw = 266;
    var menu = '<g filter="url(#sh)"><rect x="' + mx + '" y="' + my + '" width="' + mw + '" height="186" rx="10" fill="#fff"/></g>' +
      '<text x="' + (mx + 18) + '" y="' + (my + 28) + '" font-size="14.5" font-weight="700" fill="#202124" ' + FONT + '>' + esc(w('sExt')) + '</text>' +
      '<text x="' + (mx + mw - 26) + '" y="' + (my + 28) + '" font-size="15" fill="#5F6368" ' + FONT + '>×</text>' +
      '<text x="' + (mx + 18) + '" y="' + (my + 50) + '" font-size="11" fill="#5F6368" ' + FONT + '>' + esc(w('sFull')) + '</text>' +
      '<rect x="' + (mx + 8) + '" y="' + (my + 60) + '" width="' + (mw - 16) + '" height="36" rx="8" fill="#EEF3FC"/>' +
      '<image href="' + ICON32 + '" x="' + (mx + 18) + '" y="' + (my + 68) + '" width="20" height="20"><title>Desktop Sticky Notes</title></image>' +
      '<text x="' + (mx + 48) + '" y="' + (my + 83) + '" font-size="13" fill="#202124" ' + FONT + '>Desktop Sticky Notes</text>' +
      icon(PIN, mx + mw - 30, my + 78, 18, '#3C4043') + ring(mx + mw - 30, my + 78, 15) +
      '<rect x="' + (mx + 18) + '" y="' + (my + 108) + '" width="20" height="20" rx="4" fill="#D9DCE4"/>' +
      '<text x="' + (mx + 48) + '" y="' + (my + 123) + '" font-size="13" fill="#80868B" ' + FONT + '>' + esc(w('sOther')) + '</text>' +
      icon(PIN, mx + mw - 30, my + 118, 18, '#C4C7CC') +
      '<line x1="' + mx + '" y1="' + (my + 142) + '" x2="' + (mx + mw) + '" y2="' + (my + 142) + '" stroke="#E8EAED"/>' +
      '<text x="' + (mx + 18) + '" y="' + (my + 169) + '" font-size="14" fill="#5F6368" ' + FONT + '>⚙</text>' +
      '<text x="' + (mx + 42) + '" y="' + (my + 168) + '" font-size="13" fill="#3C4043" ' + FONT + '>' + esc(w('sManage')) + '</text>';
    var over = menu + ring(604, 66, 16) +
      marker(1, 506, 66) + arrow(531, 70, 584, 70, 8) +
      marker(2, 646, 238) + arrow(642, 212, 606, 186, 6);
    return chromeWindow(320, false, over, 200);
  }

  function picOpen() {
    var px = 392, py = 92, pw = 252, ph = Math.round(pw * 800 / 720);
    var over = '<g filter="url(#sh)"><rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" rx="10" fill="#fff"/></g>' +
      '<g transform="translate(' + px + ' ' + py + ')"><image href="' + shotBase('popup') + 'popup.png" width="' + pw + '" height="' + ph + '" clip-path="url(#pop)"/></g>' +
      ring(572, 66, 16) +
      marker(3, 486, 66) + arrow(511, 70, 553, 70, 8) +
      '<rect class="pulse" x="' + (px + 8) + '" y="' + (py + 34) + '" width="' + (pw - 16) + '" height="35" rx="11" fill="none" stroke="' + MARK + '" stroke-width="2.5"/>' +
      marker(4, 330, py + 52) + arrow(355, py + 52, px - 2, py + 52, -6);
    return chromeWindow(py + ph + 30, true, over, 190);
  }

  function picNote() {
    var nx = 196, ny = 104, nw = 288, nh = Math.round(nw * 560 / 680), tb = 30;
    var mac = os === 'mac';
    var bar = mac
      ? '<rect x="' + nx + '" y="' + ny + '" width="' + nw + '" height="' + tb + '" fill="#ECECEE"/>' +
        '<circle cx="' + (nx + 16) + '" cy="' + (ny + 15) + '" r="5.5" fill="#FF5F57"/><circle cx="' + (nx + 34) + '" cy="' + (ny + 15) + '" r="5.5" fill="#FEBC2E"/><circle cx="' + (nx + 52) + '" cy="' + (ny + 15) + '" r="5.5" fill="#28C840"/>' +
        '<text x="' + (nx + nw / 2) + '" y="' + (ny + 20) + '" text-anchor="middle" font-size="12" fill="#3C4043" ' + FONT + '>' + esc(w('sNewNote')) + '</text>'
      : '<rect x="' + nx + '" y="' + ny + '" width="' + nw + '" height="' + tb + '" fill="#F3F3F3"/>' +
        '<image href="' + ICON32 + '" x="' + (nx + 9) + '" y="' + (ny + 7) + '" width="16" height="16"><title>Desktop Sticky Notes</title></image>' +
        '<text x="' + (nx + 32) + '" y="' + (ny + 20) + '" font-size="12" fill="#202124" ' + FONT + '>' + esc(w('sNewNote')) + '</text>' +
        '<text x="' + (nx + nw - 78) + '" y="' + (ny + 20) + '" font-size="11" fill="#3C4043" ' + FONT + '>—</text>' +
        '<rect x="' + (nx + nw - 50) + '" y="' + (ny + 10) + '" width="9" height="9" fill="none" stroke="#3C4043"/>' +
        '<text x="' + (nx + nw - 22) + '" y="' + (ny + 20) + '" font-size="12" fill="#3C4043" ' + FONT + '>✕</text>';
    var over = '<rect y="88" width="680" height="' + (ny + tb + nh + 40 - 88) + '" fill="#F8F9FA" opacity=".75"/>' +
      '<g filter="url(#sh)"><rect x="' + nx + '" y="' + ny + '" width="' + nw + '" height="' + (tb + nh) + '" rx="8" fill="#fff"/></g>' +
      '<clipPath id="nw"><rect x="' + nx + '" y="' + ny + '" width="' + nw + '" height="' + (tb + nh) + '" rx="8"/></clipPath>' +
      '<g clip-path="url(#nw)">' + bar + '<image href="' + shotBase('note-empty') + 'note-empty.png" x="' + nx + '" y="' + (ny + tb) + '" width="' + nw + '" height="' + nh + '"/></g>';
    return chromeWindow(ny + tb + nh + 40, true, over);
  }

  function renderPictures() {
    var pics = { pin: [picPin, 'altPin'], open: [picOpen, 'altOpen'], note: [picNote, 'altNote'] };
    Object.keys(pics).forEach(function (k) {
      var el = document.querySelector('[data-pic="' + k + '"]');
      // ids must be unique per picture: a hidden picture (display: none) can't lend its defs to the others
      el.innerHTML = pics[k][0]().replace(/id="(ah|sh|pop|nw)"/g, 'id="$1-' + k + '"').replace(/url\(#(ah|sh|pop|nw)\)/g, 'url(#$1-' + k + ')');
      el.querySelector('svg').setAttribute('aria-label', w(pics[k][1]));
    });
    var shots = { note: 'altType', ontop: 'altTop', library: 'altFind' };
    var SHOT_SIZE = { note: [340, 165], ontop: [340, 165], library: [665, 235] };
    Object.keys(shots).forEach(function (k) {
      var img = document.querySelector('[data-shot="' + k + '"]');
      var src = shotBase(k) + k + '.png';
      if (img.getAttribute('src') !== src) { img.setAttribute('srcset', src + ' 2x'); img.setAttribute('src', src); }
      // the screenshots are made at 2x: show them at their real on-screen size
      img.width = SHOT_SIZE[k][0]; img.height = SHOT_SIZE[k][1];
      img.alt = w(shots[k]);
    });
  }

  function renderKeys() {
    var rows = [
      ['kNew', keys(shortcuts.newNote)],
      ['kAny', keys(shortcuts.newNoteAnywhere)],
      ['kMenu', keys(shortcuts.openMenu)],
      ['kSearch', keys('Ctrl+F')],
      ['kSub', keys('Tab') + ' <span class="kbd-or">/</span> ' + keys('Shift+Tab')],
      ['kPaste', keys('Ctrl+V')],
    ];
    $('keysTable').innerHTML = rows.map(function (r) { return '<tr><td>' + w(r[0]) + '</td><td>' + r[1] + '</td></tr>'; }).join('');
  }

  function render() {
    document.documentElement.lang = lang;
    document.title = w('docTitle');
    Array.prototype.forEach.call(document.querySelectorAll('[data-w]'), function (el) { el.innerHTML = fill(w(el.dataset.w)); });
    Array.prototype.forEach.call(document.querySelectorAll('#osSwitch button'), function (b) { b.classList.toggle('on', b.dataset.os === os); });
    Array.prototype.forEach.call(document.querySelectorAll('#langSwitch button'), function (b) { b.classList.toggle('on', b.dataset.lang === lang); });
    document.body.dataset.os = os;
    renderPictures();
    renderKeys();
  }

  function browserLang() {
    var nl = (navigator.language || '').toLowerCase();
    var two = nl.slice(0, 2);
    return LANGS.indexOf(two) >= 0 ? two : 'en';
  }

  // ---------------- start ----------------
  var hash = location.hash.slice(1);
  if (hash === 'tutorial') hash = 'usage'; // old links from the settings
  if (hash === 'pin' || hash === 'usage') { manual = true; setMode(hash); }
  else setMode(params.get('pinned') === '1' ? 'usage' : 'pin');

  lang = LANGS.indexOf(params.get('lang')) >= 0 ? params.get('lang') : browserLang();
  render();

  // Language and real shortcuts from the extension (if it answers).
  ask({ type: 'getWelcomeInfo' }).then(function (info) {
    if (!info) return;
    if (info.shortcuts) shortcuts = Object.assign({}, shortcuts, info.shortcuts);
    if (!params.get('lang') && LANGS.indexOf(info.language) >= 0) lang = info.language;
    $('cta').hidden = false;
    render();
  });

  if (!manual) {
    checkPinState();
    pollTimer = setInterval(function () {
      if (document.visibilityState === 'visible') checkPinState();
    }, POLL_INTERVAL_MS);
  }

  // Re-check as soon as the user comes back from the toolbar.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkPinState();
  });

  // Manual switch links always win.
  document.addEventListener('click', function (e) {
    var link = e.target.closest('[data-switch]');
    if (!link) return;
    e.preventDefault();
    manual = true; stopPolling();
    setMode(link.dataset.switch);
    history.replaceState(null, '', location.pathname + location.search + '#' + link.dataset.switch);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('firstNote').addEventListener('click', function () { ask({ type: 'newNote' }); });
  $('changeKeys').addEventListener('click', function () { ask({ type: 'openShortcuts' }); });
  $('osSwitch').addEventListener('click', function (e) {
    var b = e.target.closest('[data-os]'); if (b) { os = b.dataset.os; render(); }
  });
  $('langSwitch').addEventListener('click', function (e) {
    var b = e.target.closest('[data-lang]'); if (!b) return;
    lang = b.dataset.lang; render();
    ask({ type: 'setLanguage', language: lang });
  });


  // ---------------- fireworks right after install ----------------
  // background.js opens this page with ?installed=1 only on the first install.
  // The show plays once: the flag is removed from the address, so a reload doesn't repeat it.
  var fireworksDone = false;
  function fireworks(opts) {
    opts = opts || {};
    var canvas = $('fireworks');
    if (!canvas || !canvas.getContext) return false;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    function size() {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    window.addEventListener('resize', size);
    canvas.hidden = false;
    // the colors of the green icon and its sheets
    var COLORS = ['#3BD16F', '#FF2FB9', '#FFC93C', '#2F80ED', '#9B51E0', '#FF7A45', '#22D3EE', '#FFFFFF'];
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var rockets = [], sparks = [];
    var total = opts.count || (reduce ? 3 : 14);
    var launched = 0;
    var start = performance.now();
    var nextAt = 0;
    function rand(a, b) { return a + Math.random() * (b - a); }
    function launch() {
      var x = rand(W * 0.12, W * 0.88);
      rockets.push({ x: x, y: H + 10, vx: rand(-1.2, 1.2), vy: -rand(H / 62, H / 48), targetY: rand(H * 0.12, H * 0.45), color: COLORS[(Math.random() * COLORS.length) | 0] });
      launched++;
    }
    function burst(x, y, color) {
      var n = reduce ? 40 : (60 + ((Math.random() * 40) | 0));
      var second = COLORS[(Math.random() * COLORS.length) | 0];
      for (var i = 0; i < n; i++) {
        var a = (Math.PI * 2 * i) / n + rand(-0.05, 0.05);
        var sp = rand(1.6, 5.2);
        sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: rand(0.010, 0.018), color: i % 3 ? color : second, r: rand(1.4, 2.6) });
      }
    }
    function frame(now) {
      var t = now - start;
      if (launched < total && t >= nextAt) { launch(); if (Math.random() < 0.35 && launched < total) launch(); nextAt = t + rand(230, 520); }
      // fade the previous frame: trails behind the sparks
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = rockets.length - 1; i >= 0; i--) {
        var r = rockets[i];
        r.x += r.vx; r.y += r.vy; r.vy += 0.12;
        ctx.fillStyle = r.color;
        ctx.beginPath(); ctx.arc(r.x, r.y, 2.4, 0, Math.PI * 2); ctx.fill();
        if (r.y <= r.targetY || r.vy >= -0.5) { burst(r.x, r.y, r.color); rockets.splice(i, 1); }
      }
      for (var j = sparks.length - 1; j >= 0; j--) {
        var p = sparks[j];
        p.x += p.vx; p.y += p.vy; p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.06; p.life -= p.decay;
        if (p.life <= 0) { sparks.splice(j, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (launched < total || rockets.length || sparks.length) { requestAnimationFrame(frame); return; }
      ctx.clearRect(0, 0, W, H);
      canvas.hidden = true;
      window.removeEventListener('resize', size);
      fireworksDone = true;
    }
    requestAnimationFrame(frame);
    return true;
  }
  var fireworksStarted = false;
  if (params.get('installed') === '1') {
    fireworksStarted = fireworks();
    params.delete('installed');
    var qs = params.toString();
    try { history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash); } catch (e) { /* ignore */ }
  }

  // For automated tests
  window.__welcome = {
    get mode() { return document.body.dataset.mode; },
    get manual() { return manual; },
    get reachable() { return reachable; },
    get lastLive() { return lastLive; },
    get lang() { return lang; },
    get os() { return os; },
    get fireworksStarted() { return fireworksStarted; },
    get fireworksDone() { return fireworksDone; },
    fireworks: function (o) { return fireworks(o); },
  };
})();

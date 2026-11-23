/**
 * FordOS backup bridge — Google Apps Script Web App
 *
 * SETUP (one time):
 * 1. Go to https://script.google.com and create a new project.
 * 2. Paste this entire file into Code.gs and save.
 * 3. Project Settings > Script Properties, add:
 *      FORDOS_SECRET  =  a long random string you choose
 *    (FORDOS_FOLDER_ID is filled in automatically on first run.)
 * 4. Deploy > New deployment > Web app:
 *      Execute as: Me
 *      Who has access: Anyone with the link
 * 5. Copy the Web app URL into FordOS > Cloud Backup > Settings, along with
 *    the same FORDOS_SECRET.
 *
 * The script can only see the Drive folder it creates ("FordOS Backups").
 * FordOS never stores your Google credentials.
 */

const PROPS = PropertiesService.getScriptProperties();

function doGet(e) {
  return handle_(e, 'GET');
}

function doPost(e) {
  return handle_(e, 'POST');
}

function handle_(e, method) {
  try {
    const p = method === 'POST' && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : (e.parameter || {});

    const secret = PROPS.getProperty('FORDOS_SECRET');
    if (!secret || p.token !== secret) return respond_({ ok: false, error: 'Unauthorized' });

    const folder = folder_();
    switch (p.action) {
      case 'ping':
        return respond_({ ok: true, folder: folder.getName(), folderId: folder.getId() });

      case 'list': {
        const files = [];
        const it = folder.getFiles();
        while (it.hasNext()) {
          const f = it.next();
          files.push({ name: f.getName(), id: f.getId(), size: f.getSize(), modified: f.getLastUpdated().toISOString() });
        }
        files.sort((a, b) => b.modified.localeCompare(a.modified));
        return respond_({ ok: true, files });
      }

      case 'upload': {
        if (!p.name || !p.contentBase64) return respond_({ ok: false, error: 'name and contentBase64 required' });
        const existing = folder.getFilesByName(p.name);
        while (existing.hasNext()) existing.next().setTrashed(true);
        const bytes = Utilities.base64Decode(p.contentBase64);
        const blob = Utilities.newBlob(bytes, 'application/json', p.name);
        const file = folder.createFile(blob);
        return respond_({ ok: true, name: file.getName(), id: file.getId(), size: file.getSize() });
      }

      case 'download': {
        const f = find_(folder, p.name);
        if (!f) return respond_({ ok: false, error: 'File not found' });
        const bytes = f.getBlob().getBytes();
        return respond_({ ok: true, name: f.getName(), contentBase64: Utilities.base64Encode(bytes) });
      }

      case 'delete': {
        const f = find_(folder, p.name);
        if (!f) return respond_({ ok: false, error: 'File not found' });
        f.setTrashed(true);
        return respond_({ ok: true, name: p.name });
      }

      default:
        return respond_({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return respond_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function folder_() {
  let id = PROPS.getProperty('FORDOS_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* recreate below */ }
  }
  const found = DriveApp.getFoldersByName('FordOS Backups');
  const folder = found.hasNext() ? found.next() : DriveApp.createFolder('FordOS Backups');
  PROPS.setProperty('FORDOS_FOLDER_ID', folder.getId());
  return folder;
}

function find_(folder, name) {
  const files = folder.getFilesByName(name);
  return files.hasNext() ? files.next() : null;
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

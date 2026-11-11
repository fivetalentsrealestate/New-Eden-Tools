// electron-builder afterPack hook: puts the app icon and name into the Windows .exe.
// Pure JavaScript (resedit), so installers can be built on Windows, Mac or Linux alike.
'use strict';

const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const PELibrary = await import('pe-library');
  const { productFilename } = context.packager.appInfo;
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const version = context.packager.appInfo.version;
  const [maj, min, pat] = version.split('.').map((n) => parseInt(n, 10) || 0);

  const exe = PELibrary.NtExecutable.from(fs.readFileSync(exePath));
  const res = PELibrary.NtExecutableResource.from(exe);

  // Icon
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(context.packager.info.buildResourcesDir, 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, ico.icons.map((i) => i.data));

  // Version info shown in Explorer / Task Manager
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
  vi.setFileVersion(maj, min, pat, 0, 1033);
  vi.setProductVersion(maj, min, pat, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: productFilename,
    ProductName: productFilename,
    OriginalFilename: `${productFilename}.exe`,
    InternalName: productFilename,
    CompanyName: 'New Eden Tools',
    LegalCopyright: 'MIT License'
  });
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`  • set icon and version info on ${path.basename(exePath)}`);
};

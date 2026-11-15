export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
}

export interface DriveFilePayload {
  file: DriveFileItem;
  kind: 'text' | 'binary';
  textContent?: string;
  base64Data?: string;
  effectiveMimeType: string;
}

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

export async function listRecentDriveFiles(
  accessToken: string,
  searchQuery = ''
): Promise<DriveFileItem[]> {
  const qParts = ['trashed = false', "mimeType != 'application/vnd.google-apps.folder'"];
  const trimmed = searchQuery.trim();
  if (trimmed) {
    const escaped = trimmed.replace(/'/g, "\\'");
    qParts.push(`name contains '${escaped}'`);
  }

  const params = new URLSearchParams({
    q: qParts.join(' and '),
    orderBy: 'modifiedTime desc',
    pageSize: '25',
    fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink)',
  });

  const res = await fetch(`${DRIVE_FILES_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) {
    throw new Error('AUTH_EXPIRED');
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ไม่สามารถดึงรายการไฟล์จาก Google Drive ได้ (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { files?: DriveFileItem[] };
  return data.files ?? [];
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function readDriveFileContent(
  accessToken: string,
  file: DriveFileItem
): Promise<DriveFilePayload> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  // Google Workspace native files require /export
  if (file.mimeType === 'application/vnd.google-apps.document') {
    const res = await fetch(
      `${DRIVE_FILES_URL}/${encodeURIComponent(file.id)}/export?mimeType=text/plain`,
      { headers }
    );
    if (res.status === 401) throw new Error('AUTH_EXPIRED');
    if (!res.ok) throw new Error(`ไม่สามารถอ่าน Google Doc "${file.name}" ได้`);
    return {
      file,
      kind: 'text',
      textContent: await res.text(),
      effectiveMimeType: 'text/plain',
    };
  }

  if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
    const res = await fetch(
      `${DRIVE_FILES_URL}/${encodeURIComponent(file.id)}/export?mimeType=text/csv`,
      { headers }
    );
    if (res.status === 401) throw new Error('AUTH_EXPIRED');
    if (!res.ok) throw new Error(`ไม่สามารถอ่าน Google Sheet "${file.name}" ได้`);
    return {
      file,
      kind: 'text',
      textContent: await res.text(),
      effectiveMimeType: 'text/csv',
    };
  }

  // Raw text / JSON / CSV / HTML / Markdown
  const isTextLike =
    file.mimeType.startsWith('text/') ||
    file.mimeType === 'application/json' ||
    /\.(json|csv|txt|md|html|htm)$/i.test(file.name);

  const mediaRes = await fetch(
    `${DRIVE_FILES_URL}/${encodeURIComponent(file.id)}?alt=media`,
    { headers }
  );
  if (mediaRes.status === 401) throw new Error('AUTH_EXPIRED');
  if (!mediaRes.ok) {
    throw new Error(`ไม่สามารถดาวน์โหลดไฟล์ "${file.name}" จาก Google Drive ได้`);
  }

  if (isTextLike) {
    return {
      file,
      kind: 'text',
      textContent: await mediaRes.text(),
      effectiveMimeType: file.mimeType,
    };
  }

  // Binary image or PDF for Gemini extraction
  const buf = await mediaRes.arrayBuffer();
  return {
    file,
    kind: 'binary',
    base64Data: arrayBufferToBase64(buf),
    effectiveMimeType: file.mimeType || 'application/octet-stream',
  };
}

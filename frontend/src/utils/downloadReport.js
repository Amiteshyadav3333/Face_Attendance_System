const isAndroidApp = navigator.userAgent.includes('FaceAttendanceAndroid');
let androidExportPort;

if (isAndroidApp) {
  window.addEventListener('message', (event) => {
    if (event.data === 'face-attendance-export' && event.ports.length === 1) {
      androidExportPort?.close();
      androidExportPort = event.ports[0];
    }
  });
}

export { isAndroidApp };

export function downloadAttachment(dataUrl, filename) {
  if (isAndroidApp) {
    const match = /^data:[^,]*;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!androidExportPort || !match || match[1].length > 7 * 1024 * 1024) {
      throw new Error("Could not open the Android attachment saver.");
    }
    androidExportPort.postMessage(JSON.stringify({ filename, attachment: match[1] }));
    return;
  }

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export async function downloadReport(data, filename) {
  const csv = new Blob([data], { type: 'text/csv' });
  if (isAndroidApp) {
    if (!androidExportPort || csv.size > 8 * 1024 * 1024) {
      throw new Error('The Android file picker is unavailable for this report.');
    }
    androidExportPort.postMessage(JSON.stringify({ filename, contents: await csv.text() }));
    return;
  }

  const url = URL.createObjectURL(csv);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

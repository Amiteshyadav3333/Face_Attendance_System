import { isAndroidApp } from "./downloadReport";

const pending = new Map();
let nativePort;
let requestId = 0;

if (isAndroidApp) {
  window.addEventListener("message", event => {
    if (event.data !== "face-attendance-device" || event.ports.length !== 1) return;
    nativePort?.close();
    nativePort = event.ports[0];
    nativePort.onmessage = ({ data }) => {
      const { id, error, latitude, longitude, accuracy } = JSON.parse(data);
      const request = pending.get(id);
      if (!request) return;
      clearTimeout(request.timeout);
      pending.delete(id);
      if (error) request.reject(new Error(error));
      else request.resolve({ latitude, longitude, accuracy });
    };
  });
}

function androidRequest(operation, accuracy) {
  return new Promise((resolve, reject) => {
    if (!nativePort) {
      reject(new Error("Android location is unavailable. Install the latest APK and reopen the app."));
      return;
    }
    const id = ++requestId;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Location check timed out. Open the app and try again."));
    }, 65000);
    pending.set(id, { resolve, reject, timeout });
    nativePort.postMessage(JSON.stringify({ id, operation, accuracy }));
  });
}

export async function checkAttendanceDevice() {
  if (isAndroidApp) await androidRequest("check");
}

export function getAttendanceLocation(accuracy = 75) {
  if (isAndroidApp) return androidRequest("location", accuracy);
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is unavailable in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
      error => reject(new Error(error.code === 1
        ? "Allow location access in your browser and try again."
        : "Could not get your location. Turn on Location and try again.")),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

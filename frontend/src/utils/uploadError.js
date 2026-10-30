import API from "./api";

export const uploadErrorMessage = (error, action) => {
  if (error?.response?.status === 404) {
    return `The running backend is out of date and does not have the ${action} endpoint. Stop the Flask server and restart it from frontend/src/backend.`;
  }
  if (!error?.response) {
    return `Cannot reach the backend at ${API.defaults.baseURL}. Check that Flask is running, then retry the ${action}.`;
  }
  return error.response.data?.message || error.message || `${action} failed.`;
};

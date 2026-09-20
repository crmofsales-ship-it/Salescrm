import { getAccessToken } from "../lib/session";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function getToken() {
  return getAccessToken();
}

export const aiDocumentService = {
  async list() {
    const token = await getToken();
    const res = await fetch(`${API_URL}/api/ai/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to load documents");
    }
    const data = await res.json();
    return data.documents || [];
  },

  async upload(file, onProgress) {
    const token = await getToken();
    const formData = new FormData();
    formData.append("file", file);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_URL}/api/ai/documents/upload`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 400) reject(new Error(data.error || "Upload failed"));
          else resolve(data);
        } catch {
          reject(new Error("Invalid server response"));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(formData);
    });
  },

  async remove(id) {
    const token = await getToken();
    const res = await fetch(`${API_URL}/api/ai/documents/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to delete document");
    }
    return res.json();
  },
};

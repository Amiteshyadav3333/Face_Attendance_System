import React, { useEffect, useRef, useState } from "react";
import { getProfilePhoto, saveProfilePhoto } from "../utils/api";
import { uploadErrorMessage } from "../utils/uploadError";
import "./ProfileAvatar.css";

const ProfileAvatar = ({ name, className = "", editable = true }) => {
  const [photoUrl, setPhotoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let live = true;
    let objectUrl = "";
    const onPhotoUpdated = async (event) => {
      try {
        const blob = await (await fetch(event.detail)).blob();
        const nextUrl = URL.createObjectURL(blob);
        if (!live) { URL.revokeObjectURL(nextUrl); return; }
        setPhotoUrl(current => { if (current) URL.revokeObjectURL(current); return nextUrl; });
      } catch (_) {}
    };
    window.addEventListener("profile-photo-updated", onPhotoUpdated);
    getProfilePhoto().then(({ data }) => {
      objectUrl = URL.createObjectURL(data);
      if (live) setPhotoUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch(() => {});
    return () => { live = false; window.removeEventListener("profile-photo-updated", onPhotoUpdated); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, []);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { window.alert("Choose an image file"); return; }
    if (file.size > 12 * 1024 * 1024) { window.alert("Choose an image smaller than 12 MB"); return; }
    setBusy(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read this image"));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("This image could not be opened"));
        img.src = dataUrl;
      });
      const canvas = document.createElement("canvas");
      const side = Math.min(image.width, image.height);
      canvas.width = canvas.height = 512;
      canvas.getContext("2d").drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 512, 512);
      const jpeg = canvas.toDataURL("image/jpeg", 0.88);
      await saveProfilePhoto(jpeg);
      const newUrl = URL.createObjectURL(await (await fetch(jpeg)).blob());
      setPhotoUrl(current => { if (current) URL.revokeObjectURL(current); return newUrl; });
      window.dispatchEvent(new CustomEvent("profile-photo-updated", { detail: jpeg }));
    } catch (error) {
      window.alert(uploadErrorMessage(error, "profile photo upload"));
    } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" className={`profile-avatar ${className}`} onClick={() => editable && inputRef.current?.click()} disabled={!editable || busy} title={editable ? "Change profile photo" : name} aria-label={editable ? "Change profile photo" : `${name || "User"} profile photo`}>
        {photoUrl ? <img src={photoUrl} alt="" /> : <span>{(name || "U").trim().split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase()}</span>}
        {editable && <i>{busy ? "…" : "＋"}</i>}
      </button>
      {editable && <input ref={inputRef} className="profile-avatar-input" type="file" accept="image/*" onChange={upload} />}
    </>
  );
};

export default ProfileAvatar;

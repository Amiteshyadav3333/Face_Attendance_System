import React from "react";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import "./RoleSelection.css";

const RoleSelection = ({ email }) => {
  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <div className="rs-root">
      <div className="rs-card">
        <div className="rs-header">
          <div className="rs-logo">🎓 EduAttend</div>
          <button className="rs-logout" onClick={handleLogout}>Sign out</button>
        </div>
        <div className="rs-step">
          <div className="rs-role-pill student">Account not registered</div>
          <h2>Ask your teacher or administrator</h2>
          <p className="rs-subtitle">
            Your Firebase login ({email}) exists, but no attendance-system account has been created for it.
            Students are added by teachers; teacher accounts are added by administrators.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RoleSelection;

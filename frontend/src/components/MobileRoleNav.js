import React from "react";
import { FiBookOpen, FiCheckSquare, FiFolder, FiHome, FiMessageCircle, FiMic, FiUser, FiUsers, FiClipboard } from "react-icons/fi";
import "./MobileRoleNav.css";

const navItems = {
  admin: [
    ["Users", "Accounts", FiUser],
    ["Teachers", "Teachers", FiUsers],
    ["Students", "Students", FiClipboard],
    ["Subjects", "Subjects", FiBookOpen],
    ["Attendance", "Records", FiCheckSquare],
  ],
  teacher: [
    ["attendance", "Classes", FiBookOpen],
    ["students", "Students", FiUsers],
    ["chat", "Chat", FiMessageCircle],
    ["projects", "Projects", FiFolder],
    ["profile", "Profile", FiUser],
  ],
  student: [
    ["dashboard", "Attendance", FiHome],
    ["chat", "Chat", FiMessageCircle],
    ["projects", "Projects", FiFolder],
    ["interview", "Interview", FiMic],
  ],
};

export default function MobileRoleNav({ role, active, onChange }) {
  return (
    <nav className={`mobile-role-nav mobile-role-nav--${role}`} aria-label={`${role} navigation`}>
      {navItems[role].map(([id, name, Icon]) => (
        <button key={id} type="button" aria-current={active === id ? "page" : undefined} onClick={() => onChange(id)}>
          <Icon aria-hidden="true" />
          <span>{name}</span>
        </button>
      ))}
    </nav>
  );
}

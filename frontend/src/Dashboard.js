import React from "react";

function Dashboard() {
  const logout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  return (
    <div className="App">
      <h2>Welcome, Admin</h2>
      <button onClick={logout}>Logout</button>
      <p>You can now export attendance securely or access admin tools.</p>
    </div>
  );
}

export default Dashboard;
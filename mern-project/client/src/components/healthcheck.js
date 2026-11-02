import React, { useEffect, useState } from "react";
import { API_URL } from "../api";

export default function HealthStatus() {
  const [status, setStatus] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/healthcheck`)
      .then((response) => response.json())
      .then((data) => setStatus(data))
      .catch(() => setStatus({ message: "API unreachable" }));
  }, []);

  return (
    <div>
      <h3>API Status</h3>
      {JSON.stringify(status)}
    </div>
  );
}

import React from "react";
import "../../styles/auth.css";

const APP_NAME = import.meta.env.VITE_APP_NAME || "Sales CRM";

export default function AuthShell({ children }) {
  return (
    <div className="sc-auth">
      <aside className="sc-auth__aside">
        <div className="sc-brand">
          <span className="sc-brand__mark">S</span>
          {APP_NAME}
        </div>
        <div className="sc-aside__body">
          <h1 className="sc-aside__title">The sales workspace your team actually enjoys using.</h1>
          <p className="sc-aside__text">
            Leads, pipeline, activities and email — one shared source of truth per organization.
          </p>
          <ul className="sc-aside__points">
            <li>Multi-organization by design</li>
            <li>Role-based access, enforced in the database</li>
            <li>Gmail &amp; calendar built in</li>
          </ul>
        </div>
        <div className="sc-aside__foot">© {new Date().getFullYear()} {APP_NAME}</div>
      </aside>
      <main className="sc-auth__main">{children}</main>
    </div>
  );
}

export { APP_NAME };

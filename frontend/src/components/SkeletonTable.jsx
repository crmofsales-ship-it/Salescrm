export default function SkeletonTable({ cols = 6, rows = 8, hasCheckbox = false }) {
  const totalCols = hasCheckbox ? cols + 1 : cols;
  return (
    <div className="card" style={{ overflow: "hidden", marginTop: 12 }}>
      <table className="crm-table">
        <thead>
          <tr>
            {hasCheckbox && <th style={{ width: 40 }}><div className="skeleton" style={{ width: 14, height: 14, borderRadius: 3 }} /></th>}
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}>
                <div className="skeleton" style={{ height: 10, borderRadius: 4, width: i === 0 ? "65%" : i === cols - 1 ? "50%" : "75%" }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} style={{ cursor: "default" }}>
              {hasCheckbox && <td style={{ width: 40 }}><div className="skeleton" style={{ width: 14, height: 14, borderRadius: 3 }} /></td>}
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <div
                      className="skeleton"
                      style={{
                        height: 11, borderRadius: 4,
                        width: c === 0 ? "70%" : c === cols - 1 ? "35%" : `${50 + ((r * 3 + c * 7) % 35)}%`,
                        opacity: 0.6 + (r % 3) * 0.13,
                      }}
                    />
                    {c <= 1 && r % 2 === 0 && <div className="skeleton" style={{ height: 9, borderRadius: 4, width: "45%", opacity: 0.4 }} />}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

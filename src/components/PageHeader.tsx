type Props = {
  title: string;
  subtitle?: string;
};

export default function PageHeader({ title, subtitle }: Props) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg,#E44F2A 0%, #F59E0B 100%)",
        borderRadius: 22,
        padding: "18px 16px",
        color: "#fff",
        marginBottom: 16,
        boxShadow: "0 14px 30px rgba(228,79,42,0.20)",
        border: "1px solid rgba(255,255,255,0.16)",
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 22,
          fontWeight: 950,
          lineHeight: 1.15,
          letterSpacing: -0.3,
          color: "#fff",
        }}
      >
        {title}
      </h2>

      {subtitle ? (
        <p
          style={{
            margin: "8px 0 0",
            opacity: 0.94,
            fontSize: 13,
            lineHeight: 1.45,
            fontWeight: 700,
            color: "rgba(255,255,255,0.94)",
          }}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
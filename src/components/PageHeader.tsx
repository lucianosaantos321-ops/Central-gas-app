import { ui, typography } from "../styles/ui";

type Props = {
  title: string;
  subtitle?: string;
};

export default function PageHeader({ title, subtitle }: Props) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg,#E44F2A 0%, #F59E0B 100%)",
        borderRadius: ui.radius.hero,
        padding: "18px 16px",
        color: "#fff",
        marginBottom: 14,
        boxShadow: ui.shadow.orange,
        border: "1px solid rgba(255,255,255,0.16)",
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 24,
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
            fontSize: typography.subtitle.fontSize,
            lineHeight: 1.5,
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

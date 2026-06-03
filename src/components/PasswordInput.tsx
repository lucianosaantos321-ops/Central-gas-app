import { useState, type CSSProperties, type InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  inputStyle?: CSSProperties;
  labelStyle?: CSSProperties;
  wrapStyle?: CSSProperties;
};

export default function PasswordInput({
  label,
  inputStyle,
  labelStyle,
  wrapStyle,
  disabled,
  ...inputProps
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <label style={wrapStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={inputShell}>
        <input
          {...inputProps}
          disabled={disabled}
          type={visible ? "text" : "password"}
          style={{ ...inputStyle, paddingRight: 52 }}
        />
        <button
          type="button"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          title={visible ? "Ocultar senha" : "Mostrar senha"}
          onClick={() => setVisible((current) => !current)}
          onMouseDown={(event) => event.preventDefault()}
          disabled={disabled}
          style={{
            ...toggleButton,
            opacity: disabled ? 0.45 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          <EyeIcon hidden={visible} />
        </button>
      </span>
    </label>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
      {hidden ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

const inputShell: CSSProperties = {
  position: "relative",
  display: "block",
  width: "100%",
};

const toggleButton: CSSProperties = {
  position: "absolute",
  top: "50%",
  right: 8,
  transform: "translateY(-50%)",
  width: 40,
  height: 40,
  border: 0,
  borderRadius: 999,
  background: "transparent",
  color: "#596273",
  display: "grid",
  placeItems: "center",
  padding: 0,
};

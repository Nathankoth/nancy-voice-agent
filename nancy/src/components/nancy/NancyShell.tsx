import NancyNav from "./NancyNav";

interface NancyShellProps {
  children: React.ReactNode;
  active?: "dashboard" | "admin";
  footer?: React.ReactNode;
}

export default function NancyShell({ children, active, footer }: NancyShellProps) {
  return (
    <div className="nancy-landing">
      <NancyNav active={active} />
      {children}
      {footer && <footer className="nancy-footer">{footer}</footer>}
    </div>
  );
}

const FEEDBACK_URL = "https://forms.gle/gcFHEWHCMzKgMcbMA";
const SUPPORT_URL = "https://wa.me/601110576001?text=Hi%20Tech%20Team%2C%20I%20need%20help%20with%20the%20Vortexa%20website.";

export function SupportLinks({ menu = false }: { menu?: boolean }) {
  return (
    <div className="support-links">
      <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" role={menu ? "menuitem" : undefined}>Give Feedback</a>
      <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" role={menu ? "menuitem" : undefined}>Contact Tech Team</a>
    </div>
  );
}

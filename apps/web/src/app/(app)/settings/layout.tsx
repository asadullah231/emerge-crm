import { SettingsNav } from "./settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-semibold">Settings</h1>
      <SettingsNav />
      <div className="mt-6">{children}</div>
    </div>
  );
}

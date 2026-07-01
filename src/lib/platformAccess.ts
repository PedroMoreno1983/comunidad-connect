const DEFAULT_PLATFORM_CREATOR_EMAILS = ["pedromoreno1983@gmail.com"];

function parseEmailList(value?: string) {
  return (value || "")
    .split(",")
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getPlatformCreatorEmails() {
  const configuredEmails = parseEmailList(
    process.env.NEXT_PUBLIC_PLATFORM_CREATOR_EMAILS || process.env.PLATFORM_CREATOR_EMAILS
  );

  return configuredEmails.length > 0 ? configuredEmails : DEFAULT_PLATFORM_CREATOR_EMAILS;
}

export function isPlatformCreatorEmail(email?: string | null) {
  if (!email) return false;
  return getPlatformCreatorEmails().includes(email.trim().toLowerCase());
}

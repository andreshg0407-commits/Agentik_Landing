/**
 * lib/security/mfa/future-compatibility.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Future Compatibility — Planned Provider Roadmap
 *
 * No server-only. No Prisma. Pure domain contracts.
 *
 * Defines the capability registry for all future MFA providers.
 * Does NOT implement them. Prepares integration contracts for:
 *   - Passkeys (FIDO2 platform authenticators)
 *   - WebAuthn (hardware security keys)
 *   - Okta
 *   - Auth0
 *   - Microsoft Entra ID (Azure AD)
 *   - Google Identity
 *   - Duo
 *   - Ping Identity
 */

import type { MfaMethod } from "./mfa-types";

// ── Capability Status ──────────────────────────────────────────────────────────

export type MfaCapabilityStatus = "AVAILABLE" | "PLANNED" | "EXPERIMENTAL" | "DEPRECATED";

// ── Capability Entry ──────────────────────────────────────────────────────────

export interface MfaCapabilityEntry {
  id:          string;
  name:        string;
  method:      MfaMethod | "SSO" | "HARDWARE_KEY";
  status:      MfaCapabilityStatus;
  description: string;
  plannedSprint?: string;
  requiresLibrary?: string;
}

// ── MFA Capabilities Registry ─────────────────────────────────────────────────

export const MFA_CAPABILITIES: MfaCapabilityEntry[] = [
  {
    id:          "TOTP_RFC6238",
    name:        "TOTP (RFC 6238)",
    method:      "TOTP",
    status:      "AVAILABLE",
    description: "Time-based One-Time Password using HMAC-SHA1. Implemented with Node.js crypto. No external dependencies.",
  },
  {
    id:           "PASSKEY",
    name:         "Passkeys (FIDO2)",
    method:       "PASSKEY",
    status:       "PLANNED",
    description:  "Platform authenticator-based passkeys. Biometric or PIN-based. Phishing-resistant.",
    plannedSprint: "AGENTIK-SECURITY-MFA-02",
    requiresLibrary: "@simplewebauthn/server",
  },
  {
    id:           "WEBAUTHN",
    name:         "WebAuthn Hardware Keys",
    method:       "WEBAUTHN",
    status:       "PLANNED",
    description:  "Hardware security key support (YubiKey, etc.) via WebAuthn W3C standard.",
    plannedSprint: "AGENTIK-SECURITY-MFA-02",
    requiresLibrary: "@simplewebauthn/server",
  },
  {
    id:           "EMAIL_OTP",
    name:         "Email OTP",
    method:       "EMAIL",
    status:       "PLANNED",
    description:  "One-time codes delivered via email (Resend, SendGrid, etc.).",
    plannedSprint: "AGENTIK-SECURITY-MFA-03",
    requiresLibrary: "resend",
  },
  {
    id:           "SMS_OTP",
    name:         "SMS OTP",
    method:       "SMS",
    status:       "PLANNED",
    description:  "One-time codes delivered via SMS (Twilio, AWS SNS).",
    plannedSprint: "AGENTIK-SECURITY-MFA-03",
    requiresLibrary: "twilio",
  },
  {
    id:           "OKTA",
    name:         "Okta MFA",
    method:       "SSO",
    status:       "PLANNED",
    description:  "Okta Verify and push notifications via Okta Identity Engine.",
    plannedSprint: "AGENTIK-SECURITY-SSO-01",
    requiresLibrary: "@okta/okta-auth-js",
  },
  {
    id:           "AUTH0",
    name:         "Auth0 MFA",
    method:       "SSO",
    status:       "PLANNED",
    description:  "Auth0 Universal Login with MFA enforcement policies.",
    plannedSprint: "AGENTIK-SECURITY-SSO-01",
    requiresLibrary: "@auth0/nextjs-auth0",
  },
  {
    id:           "MICROSOFT_ENTRA",
    name:         "Microsoft Entra ID (Azure AD) MFA",
    method:       "SSO",
    status:       "PLANNED",
    description:  "Microsoft Authenticator and Conditional Access policies via MSAL.",
    plannedSprint: "AGENTIK-SECURITY-SSO-01",
    requiresLibrary: "@azure/msal-node",
  },
  {
    id:           "GOOGLE_IDENTITY",
    name:         "Google Identity MFA",
    method:       "SSO",
    status:       "PLANNED",
    description:  "Google Workspace 2-Step Verification via OAuth 2.0 + OIDC.",
    plannedSprint: "AGENTIK-SECURITY-SSO-01",
    requiresLibrary: "google-auth-library",
  },
  {
    id:           "DUO_SECURITY",
    name:         "Duo Security MFA",
    method:       "SSO",
    status:       "PLANNED",
    description:  "Duo Universal Prompt for push notifications and hardware tokens.",
    plannedSprint: "AGENTIK-SECURITY-SSO-02",
    requiresLibrary: "@duosecurity/duo_api",
  },
  {
    id:           "PING_IDENTITY",
    name:         "Ping Identity MFA",
    method:       "SSO",
    status:       "PLANNED",
    description:  "PingFederate / PingOne adaptive MFA with risk-based policies.",
    plannedSprint: "AGENTIK-SECURITY-SSO-02",
  },
];

// ── Capability Queries ────────────────────────────────────────────────────────

export function getMfaCapabilityStatus(id: string): MfaCapabilityStatus | undefined {
  return MFA_CAPABILITIES.find(c => c.id === id)?.status;
}

export function getAvailableMfaCapabilities(): MfaCapabilityEntry[] {
  return MFA_CAPABILITIES.filter(c => c.status === "AVAILABLE");
}

export function getPlannedMfaCapabilities(): MfaCapabilityEntry[] {
  return MFA_CAPABILITIES.filter(c => c.status === "PLANNED");
}

export function getMfaCapabilityById(id: string): MfaCapabilityEntry | undefined {
  return MFA_CAPABILITIES.find(c => c.id === id);
}

// ── SSO Integration Plan ──────────────────────────────────────────────────────

export interface SsoIntegrationPlan {
  provider:     string;
  protocol:     string;
  mfaStrategy:  string;
  trustLevel:   "TRUSTED_IDP" | "UNTRUSTED_IDP" | "VERIFIED";
  notes:        string;
}

export const SSO_INTEGRATION_PLANS: SsoIntegrationPlan[] = [
  {
    provider:    "Okta",
    protocol:    "OIDC + OAuth 2.0",
    mfaStrategy: "Defer MFA to Okta Identity Engine; import MFA claim into Agentik session token",
    trustLevel:  "TRUSTED_IDP",
    notes:       "Requires Okta MFA policy to be configured. Agentik validates amr claim.",
  },
  {
    provider:    "Microsoft Entra ID",
    protocol:    "OIDC + OAuth 2.0",
    mfaStrategy: "Conditional Access enforces MFA before token issuance; Agentik reads acr/amr claims",
    trustLevel:  "TRUSTED_IDP",
    notes:       "Works with Microsoft Authenticator and FIDO2 keys.",
  },
  {
    provider:    "Auth0",
    protocol:    "OIDC + OAuth 2.0",
    mfaStrategy: "Auth0 MFA rules enforce step-up; Agentik validates amr/acr in ID token",
    trustLevel:  "TRUSTED_IDP",
    notes:       "Supports SMS, TOTP, push notifications, and Passkeys via Auth0 Actions.",
  },
  {
    provider:    "Google Identity",
    protocol:    "OIDC + OAuth 2.0",
    mfaStrategy: "Google 2SV is user-managed; Agentik can enforce additional TOTP step-up",
    trustLevel:  "VERIFIED",
    notes:       "Google does not expose MFA method in token claims; supplemental TOTP recommended.",
  },
];

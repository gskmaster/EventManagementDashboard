import React from 'react';
import ReCAPTCHA from 'react-google-recaptcha';

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;

interface Props {
  onChange: (token: string | null) => void;
}

/**
 * Renders Google reCAPTCHA v2 ("I'm not a robot") when VITE_RECAPTCHA_SITE_KEY is set.
 * If the key is not configured (local dev), renders nothing and the form skips verification.
 */
export default function RecaptchaWidget({ onChange }: Props) {
  if (!SITE_KEY) return null;
  return (
    <div className="flex justify-center my-1">
      <ReCAPTCHA sitekey={SITE_KEY} onChange={onChange} />
    </div>
  );
}

/** True when reCAPTCHA is required (site key is configured). */
export const RECAPTCHA_ENABLED = !!SITE_KEY;

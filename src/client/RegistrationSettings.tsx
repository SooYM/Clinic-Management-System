import { useState } from 'react';
import { api, isDemo } from './api';
import { ErrorNotice, Field, MutationForm, Panel, ResourceState, useResource } from './components';
import './PublicRegistration.css';
interface Settings {
  enabled: boolean;
  version: number;
  url: string;
  qrCodeDataUrl: string;
  branchId: number;
  branchName: string;
  mobileReady?: boolean;
}
export default function RegistrationSettings() {
  const settings = useResource<Settings>('/admin/registration-settings');
  const [copyError, setCopyError] = useState('');
  const [copied, setCopied] = useState(false);
  const url = settings.data?.url;
  const loopback = url
    ? ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)
    : false;
  return (
    <Panel title="Patient self-registration QR code">
      <p>
        Patients enter their details on their phones and receive a reserved ticket. Reception
        verifies identity before activating that ticket.
      </p>
      {isDemo && (
        <p className="notice info">
          Demo registration is stored only in this browser tab. Scanning this QR code on another
          phone will not submit details to this demo reception desk.
        </p>
      )}
      <ResourceState {...settings}>
        {settings.data && (
          <>
            <p>
              <strong>{settings.data.branchName}</strong> ·{' '}
              {settings.data.enabled ? 'Registration open' : 'Registration closed'}
            </p>
            {(loopback || settings.data.mobileReady === false) && (
              <p className="notice info">
                {loopback
                  ? 'This link uses localhost and cannot be opened on a patient’s phone. '
                  : 'This link is not ready for patient phones. '}
                Configure the clinic’s reachable HTTPS application address before displaying this QR
                code.
              </p>
            )}
            <MutationForm
              key={settings.data.version}
              label="Save registration settings"
              onSuccess={settings.refresh}
              onSubmit={(form) =>
                api.put('/admin/registration-settings', {
                  version: settings.data!.version,
                  enabled: form.get('enabled') === 'on',
                })
              }
            >
              <label className="checkbox">
                <input type="checkbox" name="enabled" defaultChecked={settings.data.enabled} />
                Allow patients to submit registration details for this branch
              </label>
            </MutationForm>
            {settings.data.qrCodeDataUrl && (
              <img
                className="registration-qr"
                src={settings.data.qrCodeDataUrl}
                alt={`Patient registration QR code for ${settings.data.branchName}`}
                width={240}
                height={240}
              />
            )}
            <Field label="Patient registration link">
              <input
                className="registration-link"
                value={settings.data.url}
                readOnly
                onFocus={(event) => event.target.select()}
              />
            </Field>
            <div className="actions">
              <a
                className="button secondary"
                href={settings.data.url}
                target="_blank"
                rel="noreferrer"
              >
                Open registration page
              </a>
              <button
                type="button"
                className="secondary"
                onClick={async () => {
                  try {
                    setCopyError('');
                    await navigator.clipboard.writeText(settings.data!.url);
                    setCopied(true);
                  } catch {
                    setCopyError(
                      'Copy unavailable. Select the registration link above and copy it manually.',
                    );
                  }
                }}
              >
                Copy registration link
              </button>
            </div>
            {copied && (
              <p className="form-help" role="status">
                Registration link copied.
              </p>
            )}
            {copyError && <ErrorNotice>{copyError}</ErrorNotice>}
          </>
        )}
      </ResourceState>
    </Panel>
  );
}

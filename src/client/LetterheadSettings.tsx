import { useState } from 'react';
import { api } from './api';
import {
  ErrorNotice,
  Field,
  MutationForm,
  Panel,
  ResourceState,
  formText,
  useResource,
} from './components';
import type { Letterhead } from '../shared/letterhead';

export default function LetterheadSettings() {
  const resource = useResource<Letterhead & { version: number }>('/admin/letterhead');
  const [logo, setLogo] = useState<string>();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const logoDataUrl = logo ?? resource.data?.logoDataUrl ?? '';
  return (
    <Panel title="Document letterhead">
      <ResourceState {...resource}>
        {resource.data && (
          <MutationForm
            key={resource.data.version}
            label="Save letterhead"
            onSubmit={(form) =>
              api.put('/admin/letterhead', {
                version: resource.data!.version,
                logoDataUrl,
                header: formText(form, 'header'),
                address: formText(form, 'address'),
                footer: formText(form, 'footer'),
              })
            }
            onSuccess={() => {
              setSaved(true);
              setLogo(undefined);
              resource.refresh();
            }}
          >
            <p className="form-help">
              New medical certificates, referral letters, lab requests and receipts use these
              clinic-wide details. Issued records keep their saved letterhead.
            </p>
            <Field label="Clinic logo (PNG or JPEG)">
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  setError('');
                  setSaved(false);
                  if (!file) return;
                  if (file.size > 160 * 1024 || !['image/png', 'image/jpeg'].includes(file.type)) {
                    setError('Choose a PNG or JPEG logo up to 160 KB.');
                    event.target.value = '';
                    return;
                  }
                  try {
                    const value = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(String(reader.result));
                      reader.onerror = reject;
                      reader.readAsDataURL(file);
                    });
                    setLogo(value);
                  } catch {
                    setError('Logo could not be read. Choose the file again.');
                  }
                }}
              />
            </Field>
            {logoDataUrl && (
              <div>
                <img
                  src={logoDataUrl}
                  alt="Clinic logo preview"
                  width={100}
                  style={{ maxHeight: 90, objectFit: 'contain' }}
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setLogo('');
                    setSaved(false);
                  }}
                >
                  Remove logo
                </button>
              </div>
            )}
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <div className="form-grid">
              <Field label="Header / contact details">
                <textarea
                  name="header"
                  maxLength={500}
                  defaultValue={resource.data.header}
                  onChange={() => setSaved(false)}
                />
              </Field>
              <Field label="Letterhead address">
                <textarea
                  name="address"
                  maxLength={1000}
                  defaultValue={resource.data.address}
                  onChange={() => setSaved(false)}
                />
                <small>Leave blank to use each branch’s address.</small>
              </Field>
              <Field label="Footer">
                <textarea
                  name="footer"
                  maxLength={500}
                  defaultValue={resource.data.footer}
                  onChange={() => setSaved(false)}
                />
              </Field>
            </div>
          </MutationForm>
        )}
      </ResourceState>
      {saved && (
        <p className="notice success" role="status">
          Letterhead saved.
        </p>
      )}
    </Panel>
  );
}

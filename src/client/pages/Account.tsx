import { api } from '../api';
import { Field, MutationForm, PageTitle, Panel, formText } from '../components';
import { PASSWORD_MIN_LENGTH } from '../../shared/password-policy';
export default function Account() {
  return (
    <>
      <PageTitle
        title="Account security"
        description="Keep your staff account protected with a strong, unique password."
      />
      <Panel title="Change your password">
        <MutationForm
          label="Update password"
          onSubmit={(f) =>
            api.post('/auth/change-password', {
              currentPassword: formText(f, 'currentPassword'),
              newPassword: formText(f, 'newPassword'),
            })
          }
        >
          <div className="form-grid">
            <Field label="Current password">
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="New password" hint={`Use at least ${PASSWORD_MIN_LENGTH} characters.`}>
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={128}
                required
              />
            </Field>
          </div>
        </MutationForm>
      </Panel>
    </>
  );
}

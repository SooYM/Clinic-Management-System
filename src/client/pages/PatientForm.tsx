import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { ErrorNotice, Field, MutationForm, formText } from '../components';
import { type Patient } from '../types';
import { formatMalaysianIc, parseMalaysianIc } from '../../shared/patient-identity';
const states = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Perak',
  'Perlis',
  'Pulau Pinang',
  'Sabah',
  'Sarawak',
  'Selangor',
  'Terengganu',
  'Kuala Lumpur',
  'Labuan',
  'Putrajaya',
];
const currentYear = Number(
  new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' }).format(
    new Date(),
  ),
);
export default function PatientForm({
  initial,
  onSaved,
}: {
  initial?: Patient;
  onSaved: (patient: Patient) => void;
}) {
  const [nationality, setNationality] = useState<Patient['nationality']>(
    initial?.nationality || 'MALAYSIAN',
  );
  const [nationalId, setNationalId] = useState(initial?.nationalId || '');
  const [dateOfBirth, setDateOfBirth] = useState(initial?.dateOfBirth?.slice(0, 10) || '');
  const [sex, setSex] = useState<Patient['sex']>(initial?.sex || 'FEMALE');
  const [identityError, setIdentityError] = useState('');
  const [postcode, setPostcode] = useState(initial?.postcode || '');
  const [city, setCity] = useState(initial?.city || '');
  const [addressState, setAddressState] = useState(initial?.state || '');
  const [localities, setLocalities] = useState<{ postcode: string; city: string; state: string }[]>(
    [],
  );
  const [postcodeStatus, setPostcodeStatus] = useState('');
  const [localityChoice, setLocalityChoice] = useState('');
  const address = useRef({ city: initial?.city || '', state: initial?.state || '' });
  const autofilled = useRef<{ city?: string; state?: string }>({});
  function updateCity(value: string) {
    address.current.city = value;
    setCity(value);
    autofilled.current.city = undefined;
  }
  function updateState(value: string) {
    address.current.state = value;
    setAddressState(value);
    autofilled.current.state = undefined;
  }
  function clearAutofilled() {
    setLocalityChoice('');
    if (autofilled.current.city !== undefined && address.current.city === autofilled.current.city) {
      address.current.city = '';
      setCity('');
    }
    if (
      autofilled.current.state !== undefined &&
      address.current.state === autofilled.current.state
    ) {
      address.current.state = '';
      setAddressState('');
    }
    autofilled.current = {};
  }
  function chooseLocality(locality: { city: string; state: string }, explicit = false) {
    if (
      !explicit &&
      ((address.current.city &&
        address.current.city.trim().toLowerCase() !== locality.city.trim().toLowerCase()) ||
        (address.current.state &&
          address.current.state.trim().toLowerCase() !== locality.state.trim().toLowerCase()))
    )
      return;
    if (explicit || !address.current.city) {
      address.current.city = locality.city;
      setCity(locality.city);
      autofilled.current.city = locality.city;
    }
    if (explicit || !address.current.state) {
      address.current.state = locality.state;
      setAddressState(locality.state);
      autofilled.current.state = locality.state;
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    setLocalities([]);
    setPostcodeStatus('');
    if (nationality !== 'MALAYSIAN' || !/^\d{5}$/.test(postcode)) return () => controller.abort();
    setPostcodeStatus('Looking up city and state…');
    const timer = window.setTimeout(async () => {
      try {
        const matches = await api.get<{ postcode: string; city: string; state: string }[]>(
          `/references/postcodes/${encodeURIComponent(postcode)}`,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setLocalities(matches);
        if (matches.length === 1) {
          chooseLocality(matches[0]);
          setPostcodeStatus(
            'Postcode matched. Review city and state; manual corrections are allowed.',
          );
        } else
          setPostcodeStatus(
            matches.length
              ? 'This postcode has multiple localities. Choose the correct locality or enter city and state manually.'
              : 'Postcode not found in the local directory. Enter city and state manually.',
          );
      } catch (error) {
        if (!controller.signal.aborted)
          setPostcodeStatus(
            error instanceof Error
              ? error.message
              : 'Postcode lookup unavailable. Enter city and state manually.',
          );
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [postcode, nationality]);
  function updateIdentity(value: string) {
    const formatted = formatMalaysianIc(value);
    setNationalId(formatted);
    setIdentityError('');
    if (formatted.replaceAll('-', '').length === 12) {
      try {
        const derived = parseMalaysianIc(formatted, currentYear);
        setDateOfBirth(derived.dateOfBirth);
        setSex(derived.sex);
      } catch (error) {
        setIdentityError((error as Error).message);
      }
    }
  }
  return (
    <MutationForm
      label={initial ? 'Save patient details' : 'Register patient'}
      onSubmit={async (f) => {
        let canonical = nationalId;
        if (nationality === 'MALAYSIAN') {
          const derived = parseMalaysianIc(nationalId, currentYear);
          canonical = derived.nationalId;
          const digits = canonical.replaceAll('-', '');
          if (dateOfBirth.replaceAll('-', '').slice(2) !== digits.slice(0, 6))
            throw new Error(
              'Date of birth must match the IC birth date. Only its century may be corrected.',
            );
          if (sex !== derived.sex) throw new Error('Gender must match the final IC digit.');
        }
        const firstName = formText(f, 'firstName'),
          lastName = formText(f, 'lastName');
        const body = {
          name: [firstName, lastName].filter(Boolean).join(' '),
          firstName,
          lastName,
          nationality,
          nationalId: canonical,
          dateOfBirth,
          sex,
          phone: formText(f, 'phone'),
          email: formText(f, 'email'),
          bloodGroup: formText(f, 'bloodGroup'),
          addressLine1: formText(f, 'addressLine1'),
          addressLine2: formText(f, 'addressLine2'),
          postcode: formText(f, 'postcode'),
          city: formText(f, 'city'),
          state: formText(f, 'state'),
          allergies: formText(f, 'allergies')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          conditions: formText(f, 'conditions')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          notificationConsent: f.get('notificationConsent') === 'on',
          ...(initial ? { version: initial.version } : {}),
        };
        const saved = initial
          ? await api.put<Patient>(`/patients/${initial.id}`, body)
          : await api.post<Patient>('/patients', body);
        onSaved(saved);
      }}
    >
      <div className="form-grid">
        <Field label="First name" hint="Enter the name as recorded on the identity document.">
          <input
            name="firstName"
            required
            maxLength={100}
            autoComplete="given-name"
            defaultValue={initial?.firstName || initial?.name}
            placeholder="e.g. Nur Aisyah"
          />
        </Field>
        <Field label="Last name" hint="Leave blank for a single legal name.">
          <input
            name="lastName"
            maxLength={100}
            autoComplete="family-name"
            defaultValue={initial?.lastName || ''}
            placeholder="e.g. Abdullah"
          />
        </Field>
        <Field label="Nationality">
          <select
            value={nationality}
            onChange={(e) => {
              setNationality(e.target.value as Patient['nationality']);
              setNationalId('');
              setDateOfBirth('');
              setIdentityError('');
              clearAutofilled();
            }}
          >
            <option value="MALAYSIAN">Malaysian</option>
            <option value="NON_MALAYSIAN">Non-Malaysian</option>
          </select>
        </Field>
        <Field
          label={nationality === 'MALAYSIAN' ? 'Malaysian IC' : 'Passport number'}
          hint={
            nationality === 'MALAYSIAN'
              ? 'Enter 12 digits. Birth date and gender are derived automatically.'
              : 'Enter the passport number as recorded.'
          }
        >
          <input
            required
            value={nationalId}
            onChange={(e) =>
              nationality === 'MALAYSIAN'
                ? updateIdentity(e.target.value)
                : setNationalId(e.target.value)
            }
            inputMode={nationality === 'MALAYSIAN' ? 'numeric' : 'text'}
            maxLength={nationality === 'MALAYSIAN' ? 14 : 50}
            placeholder={nationality === 'MALAYSIAN' ? '900101-14-5678' : 'e.g. A12345678'}
          />
        </Field>
        <Field
          label="Date of birth"
          hint={
            nationality === 'MALAYSIAN'
              ? 'Confirm the birth century; YY-MM-DD must match the IC.'
              : undefined
          }
        >
          <input
            type="date"
            required
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
          />
        </Field>
        <Field label="Gender">
          <select
            value={sex}
            disabled={nationality === 'MALAYSIAN'}
            onChange={(e) => setSex(e.target.value as Patient['sex'])}
          >
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            {nationality === 'NON_MALAYSIAN' && <option value="OTHER">Other</option>}
          </select>
        </Field>
        <Field label="Phone">
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={initial?.phone}
            placeholder="e.g. 012-3456789"
          />
        </Field>
        <Field label="Email">
          <input
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={initial?.email}
            placeholder="e.g. patient@example.com"
          />
        </Field>
        <Field label="Address line 1">
          <input
            name="addressLine1"
            autoComplete="address-line1"
            defaultValue={initial?.addressLine1}
            placeholder="e.g. No. 12, Jalan Meranti"
          />
        </Field>
        <Field label="Address line 2">
          <input
            name="addressLine2"
            autoComplete="address-line2"
            defaultValue={initial?.addressLine2}
            placeholder="e.g. Taman Bukit Indah"
          />
        </Field>
        <Field label="Postcode">
          <input
            name="postcode"
            autoComplete="postal-code"
            value={postcode}
            onChange={(e) => {
              clearAutofilled();
              setPostcode(e.target.value);
            }}
            maxLength={20}
            placeholder="e.g. 43000"
          />
        </Field>
        {nationality === 'MALAYSIAN' && localities.length > 1 && (
          <Field label="Postcode locality">
            <select
              value={localityChoice}
              onChange={(e) => {
                setLocalityChoice(e.target.value);
                if (!e.target.value) return;
                const choice = localities[Number(e.target.value)];
                if (choice) chooseLocality(choice, true);
              }}
            >
              <option value="">Choose locality</option>
              {localities.map((locality, index) => (
                <option value={index} key={`${locality.city}:${locality.state}`}>
                  {locality.city} · {locality.state}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="City / town">
          <input
            name="city"
            autoComplete="address-level2"
            value={city}
            onChange={(e) => updateCity(e.target.value)}
            placeholder="e.g. Kajang"
          />
        </Field>
        <Field label="State / region">
          <input
            name="state"
            autoComplete="address-level1"
            value={addressState}
            onChange={(e) => updateState(e.target.value)}
            list="malaysian-states"
            placeholder="e.g. Selangor"
          />
          <datalist id="malaysian-states">
            {states.map((state) => (
              <option key={state} value={state} />
            ))}
          </datalist>
        </Field>
        <Field label="Blood group">
          <select name="bloodGroup" defaultValue={initial?.bloodGroup || ''}>
            <option value="">Unknown</option>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Allergies" hint="Separate each allergy with a comma.">
          <input
            name="allergies"
            defaultValue={initial?.allergies?.join(', ')}
            placeholder="e.g. Penicillin, aspirin"
          />
        </Field>
        <Field label="Chronic conditions">
          <input
            name="conditions"
            defaultValue={initial?.conditions?.join(', ')}
            placeholder="e.g. Hypertension"
          />
        </Field>
      </div>
      {postcodeStatus && (
        <p className="form-help" role="status">
          {postcodeStatus}
        </p>
      )}
      {identityError && <ErrorNotice>{identityError}</ErrorNotice>}
      <label className="checkbox">
        <input
          name="notificationConsent"
          type="checkbox"
          defaultChecked={initial?.notificationConsent}
        />
        Patient consents to appointment and queue notifications
      </label>
    </MutationForm>
  );
}

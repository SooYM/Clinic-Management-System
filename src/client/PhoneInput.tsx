import { useState } from 'react';
import { Field } from './components';
import { joinPhone, phoneCountries, splitPhone } from '../shared/phone-input';

export default function PhoneInput({ initial = '' }: { initial?: string }) {
  const [parts, setParts] = useState(() => splitPhone(initial));
  const [changed, setChanged] = useState(false);
  return (
    <div className="phone-fields" data-guide="field-phone">
      <Field label="Phone country code">
        <select
          autoComplete="tel-country-code"
          value={parts.code}
          onChange={(event) => {
            setChanged(true);
            setParts({ ...parts, code: event.target.value });
          }}
        >
          {phoneCountries.map(([code, country]) => (
            <option key={code} value={code}>
              {country} ({code})
            </option>
          ))}
          <option value="">Other country — enter full number</option>
        </select>
      </Field>
      <Field
        label="Phone"
        hint={
          parts.code
            ? 'Enter the number without the country code. Full international numbers can also be pasted.'
            : 'Include + and the country code, for example +358 40 123 4567.'
        }
      >
        <input
          type="tel"
          autoComplete="tel-national"
          value={parts.number}
          onChange={(event) => {
            setChanged(true);
            const number = event.target.value;
            setParts(number.trim().startsWith('+') ? splitPhone(number) : { ...parts, number });
          }}
          maxLength={parts.code ? 50 - parts.code.length - 1 : 50}
          pattern={parts.code ? undefined : '\\+.*'}
          placeholder={parts.code === '+60' ? 'e.g. 12-345 6789' : 'Phone number'}
        />
      </Field>
      <input
        type="hidden"
        name="phone"
        value={changed ? joinPhone(parts.code, parts.number) : initial}
      />
    </div>
  );
}

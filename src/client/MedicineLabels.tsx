import { useEffect, useRef, useState } from 'react';
import DetailDialog from './DetailDialog';
import { isDemo } from './api';
import { humanize } from './types';
import { ErrorNotice, ResourceState, useResource } from './components';
import type { MedicineLabelPrescription } from '../shared/medicine-labels';
import './MedicineLabels.css';

export default function MedicineLabels({
  encounterId,
  onClose,
}: {
  encounterId: number;
  onClose: () => void;
}) {
  const resource = useResource<MedicineLabelPrescription>(
    `/encounters/${encounterId}/medicine-labels`,
  );
  const prescription = resource.data;
  const [printIndex, setPrintIndex] = useState<number | null>(null);
  const [printRequest, setPrintRequest] = useState(0);
  const [printError, setPrintError] = useState('');
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!prescription) return;
    let cancelled = false,
      frame = 0;
    setPrintError('');
    Promise.all(
      Array.from(sheet.current?.querySelectorAll('img') || []).map((image) => image.decode()),
    )
      .then(() => document.fonts.ready)
      .then(() => {
        if (!cancelled) frame = requestAnimationFrame(() => window.print());
      })
      .catch(() => {
        if (!cancelled)
          setPrintError('Clinic logo could not load. Retry printing after checking the logo.');
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [prescription?.id, printRequest]);
  function print(index: number | null) {
    setPrintIndex(index);
    setPrintRequest((request) => request + 1);
  }
  return (
    <DetailDialog open title="Prescription stickers" onClose={onClose}>
      <ResourceState {...resource}>
        {prescription && (
          <>
            <div className="medicine-label-tools">
              <p>Print saved dispensing details. Choose your label printer and paper size.</p>
              <button type="button" onClick={() => print(null)}>
                Print all stickers
              </button>
            </div>
            {printError && <ErrorNotice>{printError}</ErrorNotice>}
            <div className="medicine-label-sheet" ref={sheet}>
              {prescription.prescriptions.map((rx, index) => (
                <article
                  className="medicine-label"
                  key={index}
                  data-print-hidden={printIndex !== null && printIndex !== index}
                >
                  {isDemo && <strong>DEMO SAMPLE · Not for clinical use</strong>}
                  <header className="medicine-label-branding">
                    {prescription.logoDataUrl && (
                      <img src={prescription.logoDataUrl} alt={`${prescription.clinicName} logo`} />
                    )}
                    <strong>{prescription.clinicName}</strong>
                    {prescription.branchName && <p>{prescription.branchName}</p>}
                    {prescription.header && <p>{prescription.header}</p>}
                    {prescription.clinicAddress && <p>{prescription.clinicAddress}</p>}
                  </header>
                  <h2>{prescription.patientName}</h2>
                  <p>
                    Patient #{prescription.patientId} · Prescription #{prescription.id}
                  </p>
                  <h3>{rx.itemName}</h3>
                  {rx.indication && <p>For: {rx.indication}</p>}
                  {rx.quantityPerDose && (
                    <p>
                      <strong>{rx.quantityPerDose} per serving</strong>
                    </p>
                  )}
                  <p>
                    {rx.frequencyPerDay} times daily · {rx.durationDays} days ·{' '}
                    {humanize(rx.mealTiming || 'ANY_TIME')}
                  </p>
                  <p>{rx.dosage}</p>
                  {rx.instructions && rx.instructions !== rx.dosage && <p>{rx.instructions}</p>}
                  {rx.form && <p>Form: {humanize(rx.form)}</p>}
                  <p>
                    Total supplied: {rx.quantity} {rx.unit || 'units'}
                  </p>
                  <p>GP: {prescription.practitionerName}</p>
                  <p>
                    Dispensed:{' '}
                    {prescription.dispensedAt
                      ? new Intl.DateTimeFormat('en-MY', {
                          timeZone: 'Asia/Kuala_Lumpur',
                          dateStyle: 'medium',
                        }).format(new Date(prescription.dispensedAt))
                      : 'Date not recorded'}
                  </p>
                  {prescription.footer && (
                    <footer className="medicine-label-footer">{prescription.footer}</footer>
                  )}
                  <button
                    type="button"
                    className="secondary medicine-label-action"
                    onClick={() => print(index)}
                    aria-label={`Print sticker for ${rx.itemName}`}
                  >
                    Print this sticker
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
      </ResourceState>
    </DetailDialog>
  );
}

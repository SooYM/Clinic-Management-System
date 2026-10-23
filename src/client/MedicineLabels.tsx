import { useEffect, useState } from 'react';
import DetailDialog from './DetailDialog';
import { isDemo } from './api';
import { humanize } from './types';
import { ResourceState, useResource } from './components';
import type { MedicineLabelPrescription } from '../shared/medicine-labels';

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
  useEffect(() => {
    if (!prescription) return;
    const frame = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(frame);
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
            <div className="medicine-label-sheet">
              {prescription.prescriptions.map((rx, index) => (
                <article
                  className="medicine-label"
                  key={index}
                  data-print-hidden={printIndex !== null && printIndex !== index}
                >
                  {isDemo && <strong>DEMO SAMPLE · Not for clinical use</strong>}
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

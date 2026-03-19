import { useEffect, useRef, useState } from 'react';

export interface VenuePlaceData {
  name: string;
  address: string;
  lat: number;
  lng: number;
  placeId: string;
}

interface VenueAutocompleteProps {
  value: string;
  placeId?: string;
  onPlaceSelect: (place: VenuePlaceData) => void;
  onChange: (value: string) => void;
}

export default function VenueAutocomplete({ value, placeId, onPlaceSelect, onChange }: VenueAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<any>(null);
  const [previewPlaceId, setPreviewPlaceId] = useState<string | null>(placeId || null);

  // Keep callback refs up-to-date so the event listener always calls the latest version
  // This fixes the stale closure bug where captured callbacks reference the initial form state
  const onChangeRef = useRef(onChange);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onPlaceSelectRef.current = onPlaceSelect; }, [onPlaceSelect]);

  // Sync external reset (e.g. form clear)
  useEffect(() => {
    if (value === '') {
      setPreviewPlaceId(null);
      if (elementRef.current) elementRef.current.value = '';
    }
  }, [value]);

  useEffect(() => {
    const init = async () => {
      if (!containerRef.current) return;
      try {
        const { PlaceAutocompleteElement } = await (window as any).google.maps.importLibrary('places');
        const autocomplete = new PlaceAutocompleteElement({ types: ['establishment', 'geocode'] });
        elementRef.current = autocomplete;
        containerRef.current.appendChild(autocomplete);

        autocomplete.addEventListener('gmp-placeselect', async (event: any) => {
          const place = event.place;
          await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'id'] });

          const placeData: VenuePlaceData = {
            name: place.displayName || '',
            address: place.formattedAddress || '',
            lat: place.location?.lat() ?? 0,
            lng: place.location?.lng() ?? 0,
            placeId: place.id || '',
          };

          const displayName = placeData.name
            ? `${placeData.name}, ${placeData.address}`
            : placeData.address;

          // Use refs so we always call the latest prop callbacks, not the stale ones from mount
          onChangeRef.current(displayName);
          onPlaceSelectRef.current(placeData);
          setPreviewPlaceId(placeData.placeId);
        });
      } catch (err) {
        console.error('Failed to init PlaceAutocompleteElement:', err);
      }
    };

    if ((window as any).google?.maps?.importLibrary) {
      init();
    } else {
      const interval = setInterval(() => {
        if ((window as any).google?.maps?.importLibrary) {
          clearInterval(interval);
          init();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, []);

  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="w-full rounded-lg border border-slate-300 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 overflow-hidden"
      />

      {previewPlaceId && (
        <div className="rounded-lg overflow-hidden border border-slate-200 h-48">
          <iframe
            title="Venue Map Preview"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            loading="lazy"
            allowFullScreen
            src={`https://www.google.com/maps/embed/v1/place?key=${mapsApiKey}&q=place_id:${previewPlaceId}`}
          />
        </div>
      )}
    </div>
  );
}

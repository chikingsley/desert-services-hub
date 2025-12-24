import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useEffect, useRef, useState } from "react";

export type AddressSuggestion = {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
};

export type UseAddressAutocompleteReturn = {
  suggestions: AddressSuggestion[];
  isLoading: boolean;
  selectPlace: (placeId: string) => Promise<string>;
  resetSession: () => void;
};

export function useAddressAutocomplete(
  inputString: string
): UseAddressAutocompleteReturn {
  const placesLib = useMapsLibrary("places");
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!placesLib) {
      return;
    }

    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;

    // Create session token if not exists
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    if (!inputString || inputString.length < 1) {
      if (suggestions.length > 0) {
        setSuggestions([]);
      }
      return;
    }

    const request: google.maps.places.AutocompleteRequest = {
      input: inputString,
      sessionToken: sessionTokenRef.current,
      includedPrimaryTypes: ["street_address", "premise", "subpremise"],
      includedRegionCodes: ["us"],
    };

    setIsLoading(true);
    AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
      .then((res) => {
        const mapped = res.suggestions
          .filter((s) => s.placePrediction?.placeId && s.placePrediction?.text?.text)
          .map((s) => ({
            placeId: s.placePrediction!.placeId,
            text: s.placePrediction!.text.text,
            mainText: s.placePrediction?.mainText?.text || "",
            secondaryText: s.placePrediction?.secondaryText?.text || "",
          }));
        setSuggestions(mapped);
      })
      .catch((err) => {
        console.error("Autocomplete error:", err);
        setSuggestions([]);
      })
      .finally(() => setIsLoading(false));
  }, [placesLib, inputString, suggestions.length]);

  const selectPlace = async (placeId: string): Promise<string> => {
    if (!placesLib) {
      return "";
    }

    const { Place } = placesLib;
    const place = new Place({ id: placeId });

    await place.fetchFields({
      fields: ["addressComponents", "formattedAddress"],
    });

    // Reset session after fetching
    sessionTokenRef.current = null;
    setSuggestions([]);

    // Build address from components to avoid abbreviations
    const components = place.addressComponents || [];
    const parts: Record<string, string> = {};

    for (const comp of components) {
      const type = comp.types[0];
      if (type === "street_number") {
        parts.streetNumber = comp.longText || "";
      } else if (type === "route") {
        parts.route = comp.longText || "";
      } else if (type === "locality") {
        parts.city = comp.longText || "";
      } else if (type === "administrative_area_level_1") {
        parts.state = comp.shortText || "";
      } else if (type === "postal_code") {
        parts.zip = comp.longText || "";
      }
    }

    const street = [parts.streetNumber, parts.route].filter(Boolean).join(" ");
    const cityStateZip = [
      parts.city,
      parts.state ? `${parts.state}${parts.zip ? ` ${parts.zip}` : ""}` : "",
    ]
      .filter(Boolean)
      .join(", ");

    return [street, cityStateZip].filter(Boolean).join(", ");
  };

  return {
    suggestions,
    isLoading,
    selectPlace,
    resetSession: () => {
      sessionTokenRef.current = null;
      setSuggestions([]);
    },
  };
}

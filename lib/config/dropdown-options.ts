import nationalitiesData from "../../config/dropdowns/nationalities.json";
import countryCodesData from "../../config/dropdowns/country-codes.json";
import dosingFrequenciesData from "../../config/dropdowns/dosing-frequencies.json";
import mealTimingsData from "../../config/dropdowns/meal-timings.json";
import bloodGroupsData from "../../config/dropdowns/blood-groups.json";
import specialtiesData from "../../config/dropdowns/specialties.json";

export interface CountryCodeOption {
  code: string;
  country: string;
  label: string;
}

export const NATIONALITIES: string[] = nationalitiesData;
export const COUNTRY_CODES: CountryCodeOption[] = countryCodesData;
export const DOSING_FREQUENCIES: string[] = dosingFrequenciesData;
export const MEAL_TIMINGS: string[] = mealTimingsData;
export const BLOOD_GROUPS: string[] = bloodGroupsData;
export const MEDICAL_SPECIALTIES: string[] = specialtiesData;

export const LLM_PROFILE_PROMPT = `You are helping me fill out a Vietnam e-Visa application profile in YAML format.

Ask me ONE question at a time. Wait for my answer before asking the next question.
When you have all required information, output ONLY a valid YAML document matching the schema below.
Use DD/MM/YYYY for all dates. Use exact English labels for dropdown fields (see hints).

---

## YAML schema

\`\`\`yaml
personal_information:
  surname: ""                    # UPPERCASE as on passport
  given_name: ""                 # UPPERCASE as on passport
  date_of_birth: ""              # DD/MM/YYYY
  date_of_birth_mode: "full"     # full | year_only
  sex: ""                        # Male | Female
  nationality: ""                # e.g. Korea (South), United States
  identity_card: ""              # national ID if applicable, else empty
  email: ""
  agree_create_account: true
  religion: ""
  place_of_birth: ""
  used_other_passports: false
  multiple_nationalities: false
  legal_violation: false

requested_information:
  entry_type: "single"           # single | multiple
  valid_from: ""                 # DD/MM/YYYY — can leave blank; extension sets from entry date
  valid_to: ""

passport_information:
  number: ""
  issuing_authority: ""
  type: "Ordinary passport"
  date_of_issue: ""
  expiry_date: ""
  other_valid_passports: false

contact_information:
  permanent_address: ""
  contact_address: ""
  telephone: ""
  emergency_contact:
    full_name: ""
    address: ""
    telephone: ""
    relationship: ""

occupation:
  occupation: ""                 # e.g. Employee, Business person
  occupation_info: ""
  company_name: ""
  position: ""
  company_address: ""
  company_phone: ""

trip_information:
  purpose_of_entry: ""           # e.g. Tourism, Business
  intended_entry_date: ""        # DD/MM/YYYY — can leave blank; popup sets this
  length_of_stay_days: ""        # number as string, e.g. "30"
  phone_in_vietnam: ""
  residential_address: ""
  province_city: ""              # e.g. HO CHI MINH City
  ward_commune: ""               # e.g. BEN THANH WARD
  border_gate_entry: ""          # e.g. Tan Son Nhat Int Airport (Ho Chi Minh City)
  border_gate_exit: ""
  temporary_residence_commitment: true
  contact_agency_in_vietnam: false
  visited_vietnam_last_year: false
  relatives_in_vietnam: false

vietnam_visits_last_year: []     # if visited_vietnam_last_year: true
accompanying_children: []

trip_expenses:
  intended_expenses_usd: ""
  bought_insurance: ""
  expense_covered_by: ""

declarations:
  final_declaration: true
\`\`\`

---

## Questions to ask (in order)

### Personal
1. Surname (as on passport)?
2. Given name(s) (as on passport)?
3. Date of birth (DD/MM/YYYY)?
4. Sex (Male/Female)?
5. Nationality (exact country name)?
6. National ID / identity card number (or none)?
7. Email address?
8. Religion?
9. Place of birth (city/country)?
10. Have you ever used other passports? (yes/no)
11. Do you have multiple nationalities? (yes/no)
12. Any violation of Vietnamese laws? (yes/no)

### Passport
13. Passport number?
14. Issuing authority?
15. Passport type (usually Ordinary passport)?
16. Date of issue (DD/MM/YYYY)?
17. Expiry date (DD/MM/YYYY)?
18. Do you hold other valid passports? (yes/no)

### Contact
19. Permanent address (full)?
20. Contact address (if different)?
21. Telephone (with country code)?
22. Emergency contact — full name?
23. Emergency contact — address?
24. Emergency contact — phone?
25. Emergency contact — relationship?

### Occupation
26. Occupation category (Employee, Business person, etc.)?
27. Occupation details / job title?
28. Company name?
29. Position?
30. Company address?
31. Company phone?

### Trip
32. Purpose of entry (Tourism, Business, etc.)?
33. How many days will you stay in Vietnam?
34. Phone number while in Vietnam?
35. Residential address in Vietnam (hotel/stay)?
36. Province/city in Vietnam?
37. Ward/commune?
38. Border gate of entry?
39. Border gate of exit?
40. Contact with agency in Vietnam? (yes/no)
41. Visited Vietnam in the last year? (yes/no)
42. Relatives currently in Vietnam? (yes/no)

### Expenses
43. Intended expenses in USD?
44. Did you buy travel insurance? (Yes/No or site label)
45. Who covers trip expenses?

---

Start with question 1 now.`;

export const PROFILE_SETUP_STEPS = [
  {
    title: 'Open the profile editor',
    body: 'Click "Edit profile" in the extension popup, or open the editor page from the extension options.',
  },
  {
    title: 'Fill in your details',
    body: 'Edit the YAML directly in the editor, or use an LLM with the Q&A prompt on the Instructions tab.',
  },
  {
    title: 'Save',
    body: 'Click Save to store your profile in the extension. The autofill script reads from saved storage first.',
  },
  {
    title: 'Optional: export profile.yaml',
    body: 'Use Download to save profile.yaml to your computer for backup or version control.',
  },
  {
    title: 'Use on the e-Visa site',
    body: 'Open the foreigners form at evisa.gov.vn, pick your entry date in the popup, then click Fill Form.',
  },
];

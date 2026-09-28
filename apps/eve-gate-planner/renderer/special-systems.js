// Systems changed by the Triglavian invasions (2020). CCP doesn't publish these through ESI,
// so they're listed here. Source: kybernaut.space/invasions — edit if CCP changes them.
(function (root) {
  'use strict';

  const TRIGLAVIAN_MINOR_VICTORY = [
    'Vaaralen', 'Litiura', 'Onanam', 'Hirri', 'Ossa', 'Nonni', 'Reitsato', 'Atgur', 'Manjonakko',
    'Oshaima', 'Actee', 'Taisy', 'Pakkonen', 'Gammel', 'Akora', 'Netsalakka', 'Piekura', 'Kulelen',
    'Arraron', 'Obe', 'Athounon', 'Carrou', 'Hikkoken', 'Sotrenzur', 'Vaajaita', 'Aldik', 'Inaya', 'Ordat'
  ];

  // "Avoid EDENCOM Systems" covers both EDENCOM Fortress and EDENCOM Minor Victory systems.
  const EDENCOM_FORTRESS = [
    'Miakie', 'Pertnineere', 'Asanot', 'Kothe', 'Uanzin', 'Aband', 'Barira', 'Astabih', 'Gelfiven',
    'Caslemon', 'Ahmak', 'Avesber', 'Hiremir', 'Arshat', 'Anbald', 'Khopa', 'Arton', 'Teonusude',
    'Adrallezoen', 'Neesher', 'Esaeel', 'Keberz', 'Bongveber', 'Ghesis', 'Boystin', 'Misneden',
    'Hentogaira', 'Yeeramoun', 'Soumi', 'Jark', 'Mamenkhanar', 'Anzalaisio', 'Mendori', 'Bawilan',
    'Odixie', 'Sasta', 'Chibi', 'Eygfe', 'Anila', 'Halibai', 'Pulin', 'Samanuni', 'Arzanni', 'Haimeh',
    'Faswiba', 'Fasse', 'Shaggoth', 'Sadye', 'Keri', 'Abha', 'Palmon', 'Seiradih', 'Warouh'
  ];

  const EDENCOM_MINOR_VICTORY = [
    'Oyonata', 'Sabusi', 'Omigiav', 'Daran', 'Elore', 'Erlendur', 'Intaki', 'Assiettes', 'Shastal',
    'Dysa', 'Ashkoo', 'Pemene', 'Esubara', 'Anher', 'Kenninck', 'Bherdasopt', 'Harner', 'Col', 'Sibe',
    'Sigga', 'Usi', 'Archavoinet', 'Rammi', 'Stacmon', 'Zahefeus', 'Berta', 'Janus', 'Reisen',
    'Ladistier', 'Keba', 'Shakasi', 'Defsunun', 'Timudan', 'Fihrneh', 'Dammalin', 'Bei', 'Saidusairos',
    'Basan', 'Vaini', 'Mormelot', 'Erkinen', 'Ham', 'Ambeke', 'Amod', 'Iro', 'Rairomon', 'Promised Land',
    'Serren', 'Arza', 'Hakana', 'Bashyam', 'Asabona', 'Unefsih', 'Offikatlin', 'Hesarid', 'Jufvitte',
    'Olide', 'Tierijev', 'Osoggur', 'Sassecho', 'Saphthar', 'Feshur', 'Iosantin', 'Rimbah', 'Madimal',
    'Nourvukaiken', 'Hakatiz', 'Chaneya', 'Ihal', 'Mista', 'Mozzidit', 'Kerying', 'Shenda', 'Noranim',
    'Renarelle', 'Bridi', 'Sasiekko', 'Brellystier', 'Paye', 'Edilkam', 'Anath', 'Horaka', 'Alamel', 'Dabrid'
  ];

  const api = { TRIGLAVIAN_MINOR_VICTORY, EDENCOM_FORTRESS, EDENCOM_MINOR_VICTORY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SpecialSystems = api;
})(typeof window !== 'undefined' ? window : globalThis);

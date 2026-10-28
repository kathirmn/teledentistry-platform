export interface ToothInfo {
  fdi: string;
  universal: string;
  name: string;
  quadrant: 'UR' | 'UL' | 'LL' | 'LR';
  type: 'Incisor' | 'Canine' | 'Premolar' | 'Molar';
}

export const DENTAL_TEETH: ToothInfo[] = [
  // Upper Right (Quadrant 1 in FDI)
  { fdi: '18', universal: '1', name: 'Maxillary Right 3rd Molar', quadrant: 'UR', type: 'Molar' },
  { fdi: '17', universal: '2', name: 'Maxillary Right 2nd Molar', quadrant: 'UR', type: 'Molar' },
  { fdi: '16', universal: '3', name: 'Maxillary Right 1st Molar', quadrant: 'UR', type: 'Molar' },
  { fdi: '15', universal: '4', name: 'Maxillary Right 2nd Premolar', quadrant: 'UR', type: 'Premolar' },
  { fdi: '14', universal: '5', name: 'Maxillary Right 1st Premolar', quadrant: 'UR', type: 'Premolar' },
  { fdi: '13', universal: '6', name: 'Maxillary Right Canine', quadrant: 'UR', type: 'Canine' },
  { fdi: '12', universal: '7', name: 'Maxillary Right Lateral Incisor', quadrant: 'UR', type: 'Incisor' },
  { fdi: '11', universal: '8', name: 'Maxillary Right Central Incisor', quadrant: 'UR', type: 'Incisor' },

  // Upper Left (Quadrant 2 in FDI)
  { fdi: '21', universal: '9', name: 'Maxillary Left Central Incisor', quadrant: 'UL', type: 'Incisor' },
  { fdi: '22', universal: '10', name: 'Maxillary Left Lateral Incisor', quadrant: 'UL', type: 'Incisor' },
  { fdi: '23', universal: '11', name: 'Maxillary Left Canine', quadrant: 'UL', type: 'Canine' },
  { fdi: '24', universal: '12', name: 'Maxillary Left 1st Premolar', quadrant: 'UL', type: 'Premolar' },
  { fdi: '25', universal: '13', name: 'Maxillary Left 2nd Premolar', quadrant: 'UL', type: 'Premolar' },
  { fdi: '26', universal: '14', name: 'Maxillary Left 1st Molar', quadrant: 'UL', type: 'Molar' },
  { fdi: '27', universal: '15', name: 'Maxillary Left 2nd Molar', quadrant: 'UL', type: 'Molar' },
  { fdi: '28', universal: '16', name: 'Maxillary Left 3rd Molar', quadrant: 'UL', type: 'Molar' },

  // Lower Left (Quadrant 3 in FDI)
  { fdi: '38', universal: '17', name: 'Mandibular Left 3rd Molar', quadrant: 'LL', type: 'Molar' },
  { fdi: '37', universal: '18', name: 'Mandibular Left 2nd Molar', quadrant: 'LL', type: 'Molar' },
  { fdi: '36', universal: '19', name: 'Mandibular Left 1st Molar', quadrant: 'LL', type: 'Molar' },
  { fdi: '35', universal: '20', name: 'Mandibular Left 2nd Premolar', quadrant: 'LL', type: 'Premolar' },
  { fdi: '34', universal: '21', name: 'Mandibular Left 1st Premolar', quadrant: 'LL', type: 'Premolar' },
  { fdi: '33', universal: '22', name: 'Mandibular Left Canine', quadrant: 'LL', type: 'Canine' },
  { fdi: '32', universal: '23', name: 'Mandibular Left Lateral Incisor', quadrant: 'LL', type: 'Incisor' },
  { fdi: '31', universal: '24', name: 'Mandibular Left Central Incisor', quadrant: 'LL', type: 'Incisor' },

  // Lower Right (Quadrant 4 in FDI)
  { fdi: '41', universal: '25', name: 'Mandibular Right Central Incisor', quadrant: 'LR', type: 'Incisor' },
  { fdi: '42', universal: '26', name: 'Mandibular Right Lateral Incisor', quadrant: 'LR', type: 'Incisor' },
  { fdi: '43', universal: '27', name: 'Mandibular Right Canine', quadrant: 'LR', type: 'Canine' },
  { fdi: '44', universal: '28', name: 'Mandibular Right 1st Premolar', quadrant: 'LR', type: 'Premolar' },
  { fdi: '45', universal: '29', name: 'Mandibular Right 2nd Premolar', quadrant: 'LR', type: 'Premolar' },
  { fdi: '46', universal: '30', name: 'Mandibular Right 1st Molar', quadrant: 'LR', type: 'Molar' },
  { fdi: '47', universal: '31', name: 'Mandibular Right 2nd Molar', quadrant: 'LR', type: 'Molar' },
  { fdi: '48', universal: '32', name: 'Mandibular Right 3rd Molar', quadrant: 'LR', type: 'Molar' },
];

export const CLINICAL_CONDITION_TAGS = [
  { label: 'Caries / Decay', color: '#ef4444' }, // Red
  { label: 'Prep Margin', color: '#06b6d4' },    // Cyan
  { label: 'Cracked / Fracture', color: '#f59e0b' }, // Amber
  { label: 'Gingival Recession', color: '#ec4899' }, // Pink
  { label: 'Endodontic Canal', color: '#8b5cf6' }, // Purple
  { label: 'Calculus / Plaque', color: '#84cc16' }, // Lime
  { label: 'Sound / Clear', color: '#10b981' },   // Green
];

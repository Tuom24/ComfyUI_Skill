export type PaletteId = 'graphite' | 'blue' | 'green' | 'violet' | 'terracotta';
export type AppearanceMode = 'light' | 'dark';
type ThemeTokens = Record<'bg' | 'sidebar' | 'surface' | 'surface-2' | 'surface-3' | 'text' | 'muted' | 'faint' | 'border' | 'border-soft' | 'accent' | 'accent-text' | 'accent-dim' | 'art-base' | 'art-ink' | 'art-soft' | 'art-warm', string>;

// Complete surface and ink families; these same tokens render the picker previews.
export const THEME_FAMILIES: Record<PaletteId, Record<AppearanceMode, ThemeTokens>> = {
  graphite: {
    light: { bg:'#ffffff', sidebar:'#f4f5f7', surface:'#ffffff', 'surface-2':'#f2f4f7', 'surface-3':'#e6eaf0', text:'#242b35', muted:'#626d7d', faint:'#737f90', border:'#dce1e8', 'border-soft':'#ebedf1', accent:'#354254', 'accent-text':'#ffffff', 'accent-dim':'#e8edf4', 'art-base':'#e1e6ec', 'art-ink':'#687b92', 'art-soft':'#c0cbd8', 'art-warm':'#d4c2b0' },
    dark: { bg:'#171a20', sidebar:'#111419', surface:'#20252d', 'surface-2':'#272e38', 'surface-3':'#333d4a', text:'#e9edf3', muted:'#acb7c6', faint:'#909eb1', border:'#3a4554', 'border-soft':'#2d3541', accent:'#c2cedf', 'accent-text':'#1e2a3b', 'accent-dim':'#303d50', 'art-base':'#293440', 'art-ink':'#9aadc3', 'art-soft':'#53677d', 'art-warm':'#b59c83' },
  },
  blue: {
    light: { bg:'#f1f6fc', sidebar:'#e2ebf6', surface:'#fcfdff', 'surface-2':'#e9f0f9', 'surface-3':'#d5e2f2', text:'#20334d', muted:'#536d8b', faint:'#627c99', border:'#cad8e9', 'border-soft':'#dde7f3', accent:'#285cb4', 'accent-text':'#ffffff', 'accent-dim':'#dce8fb', 'art-base':'#d2e3f3', 'art-ink':'#487fb0', 'art-soft':'#a5c9e0', 'art-warm':'#e1c8a5' },
    dark: { bg:'#111d30', sidebar:'#0b1628', surface:'#192a42', 'surface-2':'#20354f', 'surface-3':'#2c4665', text:'#e5effc', muted:'#a4bdd9', faint:'#8aa7ca', border:'#365172', 'border-soft':'#293f5b', accent:'#9ec8ff', 'accent-text':'#142b49', 'accent-dim':'#264767', 'art-base':'#1b3651', 'art-ink':'#8dbbde', 'art-soft':'#436e94', 'art-warm':'#ccb896' },
  },
  green: {
    light: { bg:'#f3f6f1', sidebar:'#e3ebe0', surface:'#fcfdf9', 'surface-2':'#eaf0e6', 'surface-3':'#d7e3d2', text:'#283c31', muted:'#5b7061', faint:'#6a7d6c', border:'#ccd9c8', 'border-soft':'#dfe8da', accent:'#31664d', 'accent-text':'#ffffff', 'accent-dim':'#dcebdc', 'art-base':'#dbe7d6', 'art-ink':'#658875', 'art-soft':'#b0c5a1', 'art-warm':'#d4bd95' },
    dark: { bg:'#15231f', sidebar:'#101b17', surface:'#20322b', 'surface-2':'#293e32', 'surface-3':'#364f40', text:'#e5efe5', muted:'#afc5b5', faint:'#92ac9c', border:'#405c4b', 'border-soft':'#304739', accent:'#aedbb6', 'accent-text':'#1c3628', 'accent-dim':'#35553f', 'art-base':'#294535', 'art-ink':'#a4c4a3', 'art-soft':'#56795a', 'art-warm':'#c7b38c' },
  },
  violet: {
    light: { bg:'#f6f3fa', sidebar:'#eae3f2', surface:'#fefcff', 'surface-2':'#eee8f5', 'surface-3':'#dfd4ed', text:'#3b2d4c', muted:'#766384', faint:'#81708e', border:'#d8cbe4', 'border-soft':'#e7def0', accent:'#7550a7', 'accent-text':'#ffffff', 'accent-dim':'#e6dbf6', 'art-base':'#e5daee', 'art-ink':'#9273ac', 'art-soft':'#c2acd5', 'art-warm':'#dcbcaf' },
    dark: { bg:'#231b30', sidebar:'#1a1425', surface:'#30253e', 'surface-2':'#3b2f4a', 'surface-3':'#4d3e60', text:'#f1eafa', muted:'#c6b3d7', faint:'#ac97bf', border:'#5a466c', 'border-soft':'#443450', accent:'#d1b5f6', 'accent-text':'#352248', 'accent-dim':'#513963', 'art-base':'#443151', 'art-ink':'#c7a9dc', 'art-soft':'#806091', 'art-warm':'#d7b0a0' },
  },
  terracotta: {
    light: { bg:'#faf4ee', sidebar:'#eee1d6', surface:'#fffcf8', 'surface-2':'#f3e9de', 'surface-3':'#e8d7c8', text:'#48362d', muted:'#826b5d', faint:'#8c7666', border:'#dfcdbd', 'border-soft':'#ecdfd1', accent:'#a15138', 'accent-text':'#ffffff', 'accent-dim':'#f1dfd2', 'art-base':'#eedccc', 'art-ink':'#b57e60', 'art-soft':'#d4b89a', 'art-warm':'#cba179' },
    dark: { bg:'#2b201b', sidebar:'#211814', surface:'#392b24', 'surface-2':'#44332a', 'surface-3':'#594135', text:'#f5ece3', muted:'#d1b9a6', faint:'#b89d88', border:'#695043', 'border-soft':'#503c31', accent:'#efb69a', 'accent-text':'#44291e', 'accent-dim':'#634231', 'art-base':'#513a2d', 'art-ink':'#d9ad8b', 'art-soft':'#976c4e', 'art-warm':'#e0bd90' },
  },
};

export const PALETTES: { id: PaletteId; name: string; description: string }[] = [
  { id:'graphite', name:'石墨', description:'纯白与冷灰' },
  { id:'blue', name:'海蓝', description:'海雾与深海' },
  { id:'green', name:'松绿', description:'苔色与森林' },
  { id:'violet', name:'鸢尾', description:'雾紫与暮色' },
  { id:'terracotta', name:'赤陶', description:'砂纸与暖棕' },
];

export function applyAppearance(theme: AppearanceMode, palette: PaletteId) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.palette = palette;
  const tokens = THEME_FAMILIES[palette][theme];
  for (const [key, value] of Object.entries(tokens)) root.style.setProperty(`--${key}`, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens.bg);
}

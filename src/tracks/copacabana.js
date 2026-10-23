// Angles are the direction the wind blows / waves travel TOWARD, in degrees:
// 0 = down the course (from behind), 90 = toward the paddler's right (coming from the ama side), -90 = toward the left.
export default {
  id: 'copa', name: 'Copacabana', where: 'Rio de Janeiro · do Forte ao Leme, com o Pão de Açúcar à frente',
  desc: 'Ondulação de sul entrando de lado e quebrando na praia à esquerda. A brisa do mar vem pela direita, empurrando para a areia. Longe da arrebentação, é tranquilo.',
  level: 'Fácil', realKm: 4, len: 650,
  wind: { kn: [7, 14], dir: [-110, -60] },
  sea: { A: 0.22, L: [14, 20] },
  swell: { A: [0.45, 0.85], L: [55, 75], dir: [-95, -80] },
  shore: { side: -1, x: -130 },
  weather: { sol: 0.45, nublado: 0.35, chuva: 0.2 },
  bounds: [-120, 160], coral: 0, honu: 0.5,
  colors: { deep: 0x125e78, shallow: 0x2a8f9a, sky: 0xf2c49b, fog: 0xe9c4a2, sun: 0xffe0b0 },
  fogFar: 3800,
  rivals: [0.86, 0.92, 0.97],
};

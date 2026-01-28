const animals = [
  "perro", "gato", "elefante", "leon", "tigre", "oso", "lobo", "zorro", "conejo", "raton",
  "pajaro", "pez", "tiburon", "ballena", "delfin", "mono", "gorila", "jirafa", "cebra", "caballo"
];

const adjectives = [
  "valiente", "rapido", "fuerte", "sabio", "astuto", "leal", "alegre", "triste", "enfadado", "calmado",
  "grande", "pequeno", "largo", "corto", "viejo", "joven", "nuevo", "antiguo", "brillante", "oscuro"
];

export function generateSessionName(): string {
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  return `${animal}-${adjective}`;
}

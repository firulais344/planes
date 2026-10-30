/**
 * Lighthouse CI: móvil por defecto (emulación y red lenta simulada).
 * Umbral del proyecto: ≥ 95 en las cuatro categorías.
 * Los informes se guardan como archivos (.lighthouseci); no se suben a ningún servicio público.
 */
const PUERTO = 4326;
const base = `http://127.0.0.1:${PUERTO}`;

module.exports = {
  ci: {
    collect: {
      startServerCommand: `npx astro preview --host 127.0.0.1 --port ${PUERTO}`,
      startServerReadyPattern: `${PUERTO}`,
      startServerReadyTimeout: 60000,
      numberOfRuns: 3,
      url: [`${base}/`, `${base}/planes/comuna-13/`, `${base}/gratis/`, `${base}/contacto/`],
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.95 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.95 }],
        "categories:seo": ["error", { minScore: 0.95 }],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};

/**
 * OpenAPI 3.0 — Kerwen Kadr API (ähli endpointlar)
 */
const env = require('../config/env');

const bearer = [{ BearerAuth: [] }];
const adminBearer = [{ BearerAuth: [] }];

const success = (description, schema = { type: 'object' }) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: schema,
        },
      },
    },
  },
});

const error = (description) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
    },
  },
});

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer' },
};

const paginationQuery = [
  { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
  { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Umumy gözleg' },
];

const openapi = {
  openapi: '3.0.3',
  info: {
    title: `${env.brand.full} API`,
    description: [
      'Kadrlar agentligi — anketalar, wakansiýalar, şertnamalar, hasabatlar.',
      '',
      '**Täze / boş DB:** `GET /api/auth/setup-status` → `needsSetup: true` bolsa `POST /api/auth/bootstrap` bilen ilkinji admin dörediň (Authorize hökmany däl). Jogapdaky tokeni Authorize-e goýuň.',
      '',
      '**Auth:** `POST /api/auth/login` → `Authorize` düwmesinde `Bearer <token>`.',
      '',
      '**Rollar:** `admin` | `operator`',
    ].join('\n'),
    version: '1.0.0',
    contact: { name: env.brand.short },
  },
  servers: [
    { url: `http://localhost:${env.port}`, description: 'Local' },
    { url: '/', description: 'Current host' },
  ],
  tags: [
    { name: 'Health', description: 'Saglyk / branding' },
    { name: 'Auth', description: 'Giriş we ulanyjylar' },
    { name: 'Anketas', description: 'Dalaşgär anketalary' },
    { name: 'Vacancies', description: 'Wakansiýalar we hödürlemeler' },
    { name: 'Contracts', description: 'Şertnamalar' },
    { name: 'Match', description: 'Gabat gelýän dalaşgär / wakansiýa' },
    { name: 'Reports', description: 'Hasabatlar (admin)' },
    { name: 'Excel', description: 'Excel import / export (admin)' },
    { name: 'Comments', description: 'Teswirler' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Login jogabyndaky token',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          data: { type: 'object', nullable: true },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', example: 'admin' },
          password: { type: 'string', format: 'password', example: 'admin123' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          username: { type: 'string' },
          fullName: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'operator'] },
          isActive: { type: 'boolean' },
          canDeleteAnketa: { type: 'boolean' },
        },
      },
      Anketa: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          anketaNumber: { type: 'string', example: '26/2/78' },
          formDate: { type: 'string', format: 'date' },
          desiredPosition: { type: 'string' },
          familyName: { type: 'string' },
          firstName: { type: 'string' },
          patronymic: { type: 'string' },
          birthYear: { type: 'integer', example: 1995 },
          birthPlace: { type: 'string' },
          gender: { type: 'string', enum: ['Erkek', 'Ayal', 'Gyz'] },
          phone: { type: 'string', example: '651234567, 651234568', description: 'Her nomer 9 san' },
          educationLevel: { type: 'string', example: 'Ýokary' },
          educationDetails: { type: 'array', items: { type: 'object' } },
          workExperience: { type: 'array', items: { type: 'object' } },
          languages: { type: 'array', items: { type: 'object' } },
          computerSkills: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', enum: ['Isleyar', 'Islanok'] },
          passportNumber: { type: 'string' },
          passportIssued: { type: 'string' },
          photoUrl: { type: 'string' },
        },
      },
      Vacancy: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          vacancyNumber: { type: 'integer' },
          companyName: { type: 'string' },
          position: { type: 'string' },
          salary: { type: 'string' },
          status: { type: 'string' },
          education: { type: 'string' },
          experience: { type: 'string' },
        },
      },
      Contract: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          contractNumber: { type: 'string' },
          anketaId: { type: 'integer' },
          signedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Comment: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          entityType: { type: 'string', example: 'anketa' },
          entityId: { type: 'integer' },
          text: { type: 'string' },
          userId: { type: 'integer' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'API saglygy',
        responses: { 200: success('OK') },
      },
    },
    '/api/branding': {
      get: {
        tags: ['Health'],
        summary: 'Branding (marka) sazlamasy',
        responses: { 200: success('Branding') },
      },
    },

    /* ——— Auth ——— */
    '/api/auth/setup-status': {
      get: {
        tags: ['Auth'],
        summary: 'Setup gerekmi? (boş DB)',
        description: 'Ulanyjy ýok bolsa `needsSetup: true`. Auth hökmany däl.',
        responses: {
          200: success('Status', {
            type: 'object',
            properties: {
              needsSetup: { type: 'boolean', example: true },
              userCount: { type: 'integer', example: 0 },
            },
          }),
        },
      },
    },
    '/api/auth/bootstrap': {
      post: {
        tags: ['Auth'],
        summary: 'Ilkinji admin döret (diňe boş DB)',
        description: [
          '**Diňe** `users` tablisasy boş bolsa işleýär.',
          'Authorize / login hökmany däl.',
          'Jogapdaky `token`-i Authorize düwmesine goýuň, soň beýleki endpointlar açylar.',
          'Eýýäm ulanyjy bar bolsa → 403.',
        ].join('\n'),
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  username: { type: 'string', example: 'admin', default: 'admin' },
                  password: { type: 'string', example: 'admin123', default: 'admin123' },
                  fullName: { type: 'string', example: 'Administrator' },
                },
              },
              example: {
                username: 'admin',
                password: 'admin123',
                fullName: 'Administrator',
              },
            },
          },
        },
        responses: {
          201: success('Admin döredildi + token', {
            type: 'object',
            properties: {
              token: { type: 'string' },
              user: { $ref: '#/components/schemas/User' },
              message: { type: 'string' },
            },
          }),
          403: error('Setup eýýäm tamam — login ulanyň'),
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Giriş',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
          },
        },
        responses: {
          200: success('Token we ulanyjy', {
            type: 'object',
            properties: {
              token: { type: 'string' },
              user: { $ref: '#/components/schemas/User' },
            },
          }),
          401: error('Nädogry login'),
        },
      },
    },
    '/api/auth/profile': {
      get: {
        tags: ['Auth'],
        summary: 'Öz profili',
        security: bearer,
        responses: { 200: success('Profil', { $ref: '#/components/schemas/User' }), 401: error('Auth') },
      },
    },
    '/api/auth/staff': {
      get: {
        tags: ['Auth'],
        summary: 'Işgärler sanawy (operator/admin)',
        security: bearer,
        parameters: paginationQuery,
        responses: { 200: success('Staff list') },
      },
    },
    '/api/auth/users': {
      get: {
        tags: ['Auth'],
        summary: 'Ähli ulanyjylar (admin)',
        security: adminBearer,
        parameters: [
          ...paginationQuery,
          { name: 'role', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: success('Users'), 403: error('Admin only') },
      },
      post: {
        tags: ['Auth'],
        summary: 'Ulanyjy döret (admin)',
        security: adminBearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password', 'role'],
                properties: {
                  username: { type: 'string' },
                  password: { type: 'string' },
                  fullName: { type: 'string' },
                  role: { type: 'string', enum: ['admin', 'operator'] },
                  canDeleteAnketa: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: { 201: success('Döredildi'), 403: error('Admin only') },
      },
    },
    '/api/auth/users/{id}': {
      get: {
        tags: ['Auth'],
        summary: 'Ulanyjy (admin)',
        security: adminBearer,
        parameters: [idParam],
        responses: { 200: success('User', { $ref: '#/components/schemas/User' }) },
      },
      put: {
        tags: ['Auth'],
        summary: 'Ulanyjy üýtget (admin)',
        security: adminBearer,
        parameters: [idParam],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  fullName: { type: 'string' },
                  password: { type: 'string' },
                  role: { type: 'string', enum: ['admin', 'operator'] },
                  isActive: { type: 'boolean' },
                  canDeleteAnketa: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: { 200: success('Täzelendi') },
      },
      delete: {
        tags: ['Auth'],
        summary: 'Ulanyjy öçür (admin)',
        security: adminBearer,
        parameters: [idParam],
        responses: { 200: success('Öçürildi') },
      },
    },

    /* ——— Anketas ——— */
    '/api/anketas': {
      get: {
        tags: ['Anketas'],
        summary: 'Anketalar sanawy',
        security: bearer,
        parameters: [
          ...paginationQuery,
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['Isleyar', 'Islanok'] } },
          { name: 'gender', in: 'query', schema: { type: 'string' } },
          { name: 'desiredPosition', in: 'query', schema: { type: 'string' } },
          { name: 'phone', in: 'query', schema: { type: 'string' } },
          { name: 'anketaNumber', in: 'query', schema: { type: 'string' } },
          { name: 'faa', in: 'query', schema: { type: 'string' }, description: 'Familiýa Ady Ata' },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: success('Sanaw', {
            type: 'object',
            properties: {
              items: { type: 'array', items: { $ref: '#/components/schemas/Anketa' } },
              pagination: { $ref: '#/components/schemas/Pagination' },
            },
          }),
        },
      },
      post: {
        tags: ['Anketas'],
        summary: 'Täze anketa (multipart — surat bilen)',
        description: 'Auth hökmany däl (açyk forma). Surat: `photos` ýa-da `photo`.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['familyName', 'firstName', 'phone', 'desiredPosition'],
                properties: {
                  familyName: { type: 'string' },
                  firstName: { type: 'string' },
                  patronymic: { type: 'string' },
                  birthYear: { type: 'integer' },
                  birthPlace: { type: 'string' },
                  gender: { type: 'string' },
                  phone: { type: 'string', description: '9 sanly nomer(ler), ", " bilen' },
                  desiredPosition: { type: 'string' },
                  nationality: { type: 'string' },
                  registrationAddress: { type: 'string' },
                  currentAddress: { type: 'string' },
                  maritalStatus: { type: 'string' },
                  militaryService: { type: 'string' },
                  drivingLicense: { type: 'string' },
                  hasCar: { type: 'string' },
                  educationLevel: { type: 'string' },
                  educationDetails: { type: 'string', description: 'JSON string' },
                  workExperience: { type: 'string', description: 'JSON string' },
                  languages: { type: 'string', description: 'JSON string' },
                  computerSkills: { type: 'string', description: 'JSON string' },
                  passportNumber: { type: 'string' },
                  passportIssued: { type: 'string' },
                  formDate: { type: 'string', format: 'date' },
                  extraData: { type: 'string', description: 'JSON string' },
                  photo: { type: 'string', format: 'binary' },
                  photos: { type: 'array', items: { type: 'string', format: 'binary' } },
                },
              },
            },
          },
        },
        responses: {
          201: success('Döredildi', { $ref: '#/components/schemas/Anketa' }),
          409: error('Gaýtalanma (telefon/passport/FAA)'),
        },
      },
    },
    '/api/anketas/stats': {
      get: {
        tags: ['Anketas'],
        summary: 'Anketa statistikasy',
        security: bearer,
        responses: { 200: success('Stats') },
      },
    },
    '/api/anketas/closed-reasons': {
      get: {
        tags: ['Anketas'],
        summary: 'Ýapylan sebäpler',
        security: bearer,
        responses: { 200: success('Reasons') },
      },
    },
    '/api/anketas/print/{id}': {
      get: {
        tags: ['Anketas'],
        summary: 'Çap üçin anketa (auth hökmany däl)',
        parameters: [idParam],
        responses: { 200: success('Anketa', { $ref: '#/components/schemas/Anketa' }) },
      },
    },
    '/api/anketas/{id}': {
      get: {
        tags: ['Anketas'],
        summary: 'Anketa boýunça',
        security: bearer,
        parameters: [idParam],
        responses: { 200: success('Anketa', { $ref: '#/components/schemas/Anketa' }), 404: error('Tapylmady') },
      },
      put: {
        tags: ['Anketas'],
        summary: 'Anketany üýtget (multipart mümkin)',
        security: bearer,
        parameters: [idParam],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: { type: 'object', additionalProperties: true },
            },
            'application/json': {
              schema: { $ref: '#/components/schemas/Anketa' },
            },
          },
        },
        responses: { 200: success('Täzelendi') },
      },
      delete: {
        tags: ['Anketas'],
        summary: 'Anketany öçür (admin)',
        security: adminBearer,
        parameters: [idParam],
        responses: { 200: success('Öçürildi'), 403: error('Admin only') },
      },
    },

    /* ——— Vacancies ——— */
    '/api/vacancies': {
      get: {
        tags: ['Vacancies'],
        summary: 'Wakansiýalar sanawy',
        security: bearer,
        parameters: paginationQuery,
        responses: { 200: success('Sanaw') },
      },
      post: {
        tags: ['Vacancies'],
        summary: 'Täze wakansiýa',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  companyName: { type: 'string' },
                  position: { type: 'string' },
                  salary: { type: 'string' },
                  education: { type: 'string' },
                  experience: { type: 'string' },
                  requirements: { type: 'string' },
                  contactPhone: { type: 'string' },
                  contactEmail: { type: 'string' },
                  status: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: success('Döredildi', { $ref: '#/components/schemas/Vacancy' }) },
      },
    },
    '/api/vacancies/public': {
      get: {
        tags: ['Vacancies'],
        summary: 'Açyk wakansiýalar (auth hökmany däl)',
        parameters: paginationQuery,
        responses: { 200: success('Public list') },
      },
    },
    '/api/vacancies/stats': {
      get: {
        tags: ['Vacancies'],
        summary: 'Wakansiýa statistikasy',
        security: bearer,
        responses: { 200: success('Stats') },
      },
    },
    '/api/vacancies/by-operator': {
      get: {
        tags: ['Vacancies'],
        summary: 'Operator boýunça (admin)',
        security: adminBearer,
        responses: { 200: success('By operator') },
      },
    },
    '/api/vacancies/mail-status': {
      get: {
        tags: ['Vacancies'],
        summary: 'Poçta / Gmail ýagdaýy',
        security: bearer,
        responses: { 200: success('Mail status') },
      },
    },
    '/api/vacancies/mail-login': {
      post: {
        tags: ['Vacancies'],
        summary: 'Poçta login',
        security: bearer,
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
        },
        responses: { 200: success('OK') },
      },
    },
    '/api/vacancies/mail-logout': {
      post: {
        tags: ['Vacancies'],
        summary: 'Poçta logout',
        security: bearer,
        responses: { 200: success('OK') },
      },
    },
    '/api/vacancies/assignments': {
      get: {
        tags: ['Vacancies'],
        summary: 'Ähli hödürlemeler',
        security: bearer,
        parameters: paginationQuery,
        responses: { 200: success('Assignments') },
      },
    },
    '/api/vacancies/assignments/anketa-counts': {
      get: {
        tags: ['Vacancies'],
        summary: 'Anketa boýunça hödürleme sany',
        security: bearer,
        responses: { 200: success('Counts') },
      },
    },
    '/api/vacancies/assignments/by-anketa/{anketaId}': {
      get: {
        tags: ['Vacancies'],
        summary: 'Anketanyň hödürlemeleri',
        security: bearer,
        parameters: [{ name: 'anketaId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: success('Assignments') },
      },
    },
    '/api/vacancies/assignments/{assignmentId}': {
      patch: {
        tags: ['Vacancies'],
        summary: 'Hödürlemäni üýtget',
        security: bearer,
        parameters: [{ name: 'assignmentId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
        },
        responses: { 200: success('Täzelendi') },
      },
      delete: {
        tags: ['Vacancies'],
        summary: 'Hödürlemäni öçür',
        security: bearer,
        parameters: [{ name: 'assignmentId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: success('Öçürildi') },
      },
    },
    '/api/vacancies/{id}': {
      get: {
        tags: ['Vacancies'],
        summary: 'Wakansiýa boýunça (auth hökmany däl)',
        parameters: [idParam],
        responses: { 200: success('Vacancy', { $ref: '#/components/schemas/Vacancy' }) },
      },
      put: {
        tags: ['Vacancies'],
        summary: 'Wakansiýany üýtget',
        security: bearer,
        parameters: [idParam],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Vacancy' } } },
        },
        responses: { 200: success('Täzelendi') },
      },
      delete: {
        tags: ['Vacancies'],
        summary: 'Wakansiýany öçür (admin)',
        security: adminBearer,
        parameters: [idParam],
        responses: { 200: success('Öçürildi') },
      },
    },
    '/api/vacancies/{id}/assignments': {
      get: {
        tags: ['Vacancies'],
        summary: 'Wakansiýanyň hödürlemeleri',
        security: bearer,
        parameters: [idParam],
        responses: { 200: success('Assignments') },
      },
    },
    '/api/vacancies/{id}/send-candidates': {
      post: {
        tags: ['Vacancies'],
        summary: 'Kandidatlary poçta bilen ugrat',
        security: bearer,
        parameters: [idParam],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  anketaIds: { type: 'array', items: { type: 'integer' } },
                  to: { type: 'string' },
                  subject: { type: 'string' },
                  body: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: success('Ugradyldy') },
      },
    },
    '/api/vacancies/{id}/gmail-compose': {
      post: {
        tags: ['Vacancies'],
        summary: 'Gmail compose taýýarla',
        security: bearer,
        parameters: [idParam],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
        },
        responses: { 200: success('Compose data') },
      },
    },
    '/api/vacancies/{id}/compose-file/{anketaId}': {
      get: {
        tags: ['Vacancies'],
        summary: 'Compose goşundy faýly ýükle',
        security: bearer,
        parameters: [
          idParam,
          { name: 'anketaId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          200: {
            description: 'Faýl',
            content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
          },
        },
      },
    },
    '/api/vacancies/{id}/assign': {
      patch: {
        tags: ['Vacancies'],
        summary: 'Dalaşgäri hödürle / birikdir',
        security: bearer,
        parameters: [idParam],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  anketaId: { type: 'integer' },
                  status: { type: 'string' },
                  note: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: success('Birikdirildi') },
      },
      delete: {
        tags: ['Vacancies'],
        summary: 'Birikmäni arassala',
        security: bearer,
        parameters: [idParam],
        responses: { 200: success('Arassalandy') },
      },
    },
    '/api/vacancies/{id}/assignment-status': {
      patch: {
        tags: ['Vacancies'],
        summary: 'Hödürleme ýagdaýyny üýtget',
        security: bearer,
        parameters: [idParam],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  anketaId: { type: 'integer' },
                  status: { type: 'string' },
                  closedReason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: success('Täzelendi') },
      },
    },

    /* ——— Contracts ——— */
    '/api/contracts': {
      get: {
        tags: ['Contracts'],
        summary: 'Şertnamalar',
        security: bearer,
        parameters: paginationQuery,
        responses: { 200: success('Sanaw') },
      },
    },
    '/api/contracts/from-anketa/{anketaId}': {
      post: {
        tags: ['Contracts'],
        summary: 'Anketadan şertnama döret',
        security: bearer,
        parameters: [{ name: 'anketaId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
        },
        responses: { 201: success('Döredildi', { $ref: '#/components/schemas/Contract' }) },
      },
    },
    '/api/contracts/{id}': {
      get: {
        tags: ['Contracts'],
        summary: 'Şertnama boýunça',
        security: bearer,
        parameters: [idParam],
        responses: { 200: success('Contract', { $ref: '#/components/schemas/Contract' }) },
      },
      put: {
        tags: ['Contracts'],
        summary: 'Şertnamany üýtget',
        security: bearer,
        parameters: [idParam],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
        },
        responses: { 200: success('Täzelendi') },
      },
      delete: {
        tags: ['Contracts'],
        summary: 'Şertnamany öçür (admin)',
        security: adminBearer,
        parameters: [idParam],
        responses: { 200: success('Öçürildi') },
      },
    },
    '/api/contracts/{id}/print': {
      get: {
        tags: ['Contracts'],
        summary: 'Çap maglumaty',
        security: bearer,
        parameters: [idParam],
        responses: { 200: success('Print data') },
      },
    },
    '/api/contracts/{id}/sign': {
      patch: {
        tags: ['Contracts'],
        summary: 'Şertnamany gol çek',
        security: bearer,
        parameters: [idParam],
        responses: { 200: success('Gol çekildi') },
      },
    },

    /* ——— Match ——— */
    '/api/match/recommend': {
      get: {
        tags: ['Match'],
        summary: 'Umumy maslahat',
        security: bearer,
        parameters: [
          { name: 'vacancyId', in: 'query', schema: { type: 'integer' } },
          { name: 'anketaId', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: success('Recommendations') },
      },
    },
    '/api/match/vacancy/{vacancyId}': {
      get: {
        tags: ['Match'],
        summary: 'Wakansiýa üçin dalaşgärler',
        security: bearer,
        parameters: [{ name: 'vacancyId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: success('Matches') },
      },
    },
    '/api/match/anketa/{anketaId}': {
      get: {
        tags: ['Match'],
        summary: 'Anketa üçin wakansiýalar',
        security: bearer,
        parameters: [{ name: 'anketaId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: success('Matches') },
      },
    },

    /* ——— Reports ——— */
    '/api/reports/overview': {
      get: {
        tags: ['Reports'],
        summary: 'Umumy hasabat (admin)',
        security: adminBearer,
        parameters: [
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['day', 'week', 'month', 'year'] } },
          { name: 'date', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: success('Overview') },
      },
    },
    '/api/reports/anketas': {
      get: {
        tags: ['Reports'],
        summary: 'Anketa hasabaty (admin)',
        security: adminBearer,
        responses: { 200: success('Report') },
      },
    },
    '/api/reports/anketas-by-status': {
      get: {
        tags: ['Reports'],
        summary: 'Anketa ýagdaýy boýunça (admin)',
        security: adminBearer,
        responses: { 200: success('Report') },
      },
    },
    '/api/reports/vacancies': {
      get: {
        tags: ['Reports'],
        summary: 'Wakansiýa hasabaty (admin)',
        security: adminBearer,
        responses: { 200: success('Report') },
      },
    },
    '/api/reports/employed': {
      get: {
        tags: ['Reports'],
        summary: 'Işe ýerleşenler (admin)',
        security: adminBearer,
        responses: { 200: success('Report') },
      },
    },
    '/api/reports/contracts': {
      get: {
        tags: ['Reports'],
        summary: 'Şertnama hasabaty (admin)',
        security: adminBearer,
        responses: { 200: success('Report') },
      },
    },
    '/api/reports/by-position': {
      get: {
        tags: ['Reports'],
        summary: 'Wezipe boýunça (admin)',
        security: adminBearer,
        responses: { 200: success('Report') },
      },
    },
    '/api/reports/by-position/details': {
      get: {
        tags: ['Reports'],
        summary: 'Wezipe jikme-jik (admin)',
        security: adminBearer,
        responses: { 200: success('Report') },
      },
    },
    '/api/reports/analytics': {
      get: {
        tags: ['Reports'],
        summary: 'Analitika / diagrammalar (admin)',
        security: adminBearer,
        parameters: [
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['day', 'week', 'month', 'year'] } },
          { name: 'date', in: 'query', schema: { type: 'string' } },
          { name: 'operatorId', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: success('Analytics') },
      },
    },

    /* ——— Excel ——— */
    '/api/excel/import/anketas': {
      post: {
        tags: ['Excel'],
        summary: 'Anketa Excel import (admin)',
        security: adminBearer,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: { 200: success('Import netijesi') },
      },
    },
    '/api/excel/import/vacancies': {
      post: {
        tags: ['Excel'],
        summary: 'Wakansiýa Excel import (admin)',
        security: adminBearer,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: { 200: success('Import netijesi') },
      },
    },
    '/api/excel/export/anketas': {
      get: {
        tags: ['Excel'],
        summary: 'Anketa Excel export (admin)',
        security: adminBearer,
        responses: {
          200: {
            description: 'xlsx faýl',
            content: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
    },
    '/api/excel/export/vacancies': {
      get: {
        tags: ['Excel'],
        summary: 'Wakansiýa Excel export (admin)',
        security: adminBearer,
        responses: {
          200: {
            description: 'xlsx faýl',
            content: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
    },
    '/api/excel/export/fees': {
      get: {
        tags: ['Excel'],
        summary: 'Töleg Excel export (admin)',
        security: adminBearer,
        parameters: [
          { name: 'year', in: 'query', schema: { type: 'integer' } },
          { name: 'month', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          200: {
            description: 'xlsx faýl (Hasabat + Tölegler listleri)',
            content: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
    },
    '/api/excel/import/fees': {
      post: {
        tags: ['Excel'],
        summary: 'Töleg Excel import (admin)',
        security: adminBearer,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Import netijesi' } },
      },
    },

    /* ——— Comments ——— */
    '/api/comments': {
      get: {
        tags: ['Comments'],
        summary: 'Teswirler',
        security: bearer,
        parameters: [
          { name: 'entityType', in: 'query', required: true, schema: { type: 'string', example: 'anketa' } },
          { name: 'entityId', in: 'query', required: true, schema: { type: 'integer' } },
        ],
        responses: { 200: success('Comments', { type: 'array', items: { $ref: '#/components/schemas/Comment' } }) },
      },
      post: {
        tags: ['Comments'],
        summary: 'Teswir goş',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['entityType', 'entityId', 'text'],
                properties: {
                  entityType: { type: 'string', example: 'anketa' },
                  entityId: { type: 'integer' },
                  text: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: success('Döredildi', { $ref: '#/components/schemas/Comment' }) },
      },
    },
    '/api/comments/{id}': {
      delete: {
        tags: ['Comments'],
        summary: 'Teswiri öçür',
        security: bearer,
        parameters: [idParam],
        responses: { 200: success('Öçürildi') },
      },
    },
  },
};

module.exports = openapi;

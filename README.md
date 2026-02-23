# Pgrtriter
pgr + tr + iter

Programação estrutural iterativa.

É uma linguagem de transformação estrutural construída sobre JavaScript e é referenciada nesse pacote pelo nome de pacote DSLJS.

Ela permite definir gramáticas próprias dentro do código e transformá-las, em tempo de compilação, em JavaScript puro e determinístico por meio da criação basica e livre de macros ao estilo rust-like. Não adiciona runtime. Ele opera como sistema de reescrita sintática.

O resultado final sempre é JavaScript padrão.

---

# Conceito Central

DSLJS separa dois domínios:

1) Modelagem estrutural (livre)
2) Geração de JavaScript (#( )#)

Visualmente:

[ Gramática criada pelo autor ]
            ↓
            #( )
            ↓
[ JavaScript final ]

---

# Anatomia de um Macro

Exemplo autoral:

```dsl
$macro MODEL $nome (
        $($campo : $valor)...
    )
#(
    const $nome = {
        $($campo: $valor,)...
    }
)#
```

## Elementos Fundamentais

### $identificador — Captura

Captura partes da entrada do usuário.

Exemplo:
MODEL Usuario (...)

$nome = Usuario

---

### $( ... ) — Grupo Estrutural

Agrupa padrões compostos.

Exemplo:
$($campo : $valor)

Trata o conjunto como unidade.

---

### ... — Repetição Variádica

Permite capturar múltiplas ocorrências.

Exemplo:
$( $campo : $valor )...

Captura listas estruturais.

---

### Delimitadores

( ), [ ], { } são apenas organização visual.

Não são palavras-chave fixas da DSL.

---

# Liberdade Sintática

Tudo antes de #( )# é padrão livre inventado pelo autor.

Nada é obrigatório além de:

$macro

Exemplo válido:

```dsl
$macro qualquer_coisa <<< $a + $b >>> #(
    console.log($a + $b)
)#
```

"struct", "=>", "{ }", "[ ]" não são tokens obrigatórios.
São apenas escolhas do autor.

---

# #( )# — Domínio JavaScript

Tudo dentro de #( )# precisa ser JavaScript válido.

Exemplo:

```dsl
#(
    const x = 10
)#
```

Aqui ocorre substituição de capturas.

---

# Instalação

```bash
npm install dsljs
```

---

# Uso com Vite

```js
import { defineConfig } from "vite";
import dsljs from "dsljs/vite";

export default defineConfig({
  plugins: [dsljs()]
});
```

Arquivos .dsljs serão processados antes do bundler.

---

# Estrutura do Pacote

```
dsljs/
├── bin/
├── example/
├── src/
│   ├── parser.js
│   └── vite-plugin.js
├── package.json
└── README.md
```

---

# Configuração Obrigatória no VSCode

Criar pasta:

.projeto/
└── .vscode/
    └── settings.json

Conteúdo:

```json
{
    "files.associations": {
        "*.dsl.js": "javascript"
    },
    "[javascript]": {
        "editor.semanticHighlighting.enabled": true
    },
    "javascript.validate.enable": false
}
```

Necessário para evitar erros de LSP antes da expansão das macros.

---

# Observações

- DSLJS opera somente em tempo de compilação
- Não existe runtime adicional
- O código final é JavaScript puro

#Pgrtriter
pgr + tr + iter

Programação estrutural iterativa.

É uma linguagem de transformação estrutural construída sobre JavaScript e é referenciada nesse pacote pelo nome de pacote DSLJS.

Ela permite definir gramáticas próprias dentro do código e transformá-las, em tempo de compilação, em JavaScript puro e determinístico por meio da criação basica e livre de macros ao estilo rust-like. Não adiciona runtime. Ele opera como sistema de reescrita sintática.

O resultado final sempre é JavaScript padrão.

---

# Ilustração pelos modelos em example/

Abaixo uso dos exemplos contidos no arquivo na pasta exemplo para explicar aos caso de declaração de macros $ e como eles se desenvolvem. Na seção a seguir, explico conceituamente cada elemento da linguagem.

---

# 1. Macro THREE

## Declaração

```dsl
$macro THREE $a.$b[$delim...] #(
    const $a = new THREE.$b$delim
)#
```

## O que faz

- Captura variável ($a)
- Captura tipo dentro do namespace THREE ($b)
- Captura delimitadores ou argumentos variádicos ($delim...)
- Gera instanciação com `new`

## Uso

```dsl
THREE scene.Scene()
THREE camera.PerspectiveCamera(75, 1.7, 0.1, 1000)
```

## Expansão Mental

```
THREE scene.Scene()
        ↓
const scene = new THREE.Scene()
```

---

# 2. Macro LOG

## Declaração

```dsl
$macro LOG $msg #(
    console.log("[Macro Log]:", $msg);
)#
```

## O que faz

- Captura mensagem
- Injeta console.log padronizado
- Permite log estrutural antes da execução final

## Uso

```dsl
LOG "Sistema iniciado"
```

---

# 3. Macro ASSIGN

## Declaração

```dsl
$macro ASSIGN $a = $b #(
    function $a $b
)#
```

## O que faz

- Converte atribuição declarativa em função
- Permite padronização estrutural de declaração

## Uso

```dsl
ASSIGN soma = (a, b) {
    return a + b
}
```

---

# 4. Macro style

## Declaração

```dsl
$macro style ($text) #(
    console.log($text)
)#
```

## O que faz

- Permite injetar bloco literal
- Aceita template literal
- Pode ser adaptado para injeção real de CSS

## Uso

```dsl
style (/*css*/`
    body { background: black }
`)
```

---

# 5. Macro struct

## Declaração

```dsl
$macro struct $name [
    $($attr : $val1),
    $declarações
] => {
    $($prop = $value)...
}
#(
    const $name = function(){
        const $`${$attr}_var` = $val1;
        return {
            $attr: () => $`${$attr}_var`,
            $($prop: $value,)...
        }
    }
)#
```

## O que faz

- Captura atributos estruturais
- Permite propriedades derivadas
- Gera função encapsuladora
- Cria getters automáticos
- Suporta repetição estrutural

## Uso

```dsl
struct teste [
    atributo: "teste_atributo"
] => {
    propriedade = "valor teste"
}
```

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

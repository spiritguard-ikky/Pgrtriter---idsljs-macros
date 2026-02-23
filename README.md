# DSLJS

DSLJS é uma linguagem de transformação estrutural construída sobre JavaScript.

Ela permite definir gramáticas próprias dentro do código e transformá-las, em tempo de compilação, em JavaScript puro e determinístico. Em vez de executar lógica em runtime, DSLJS opera como um sistema de reescrita sintática: padrões são declarados, estruturas são capturadas e código final é gerado antes da execução.

A proposta central não é substituir JavaScript, mas expandi-lo com um domínio metalinguístico explícito. O desenvolvedor pode modelar sua própria sintaxe, criar regras estruturais e definir macros que reconhecem formas específicas de escrita e as convertem em código válido.

O resultado final sempre é JavaScript padrão — sem runtime adicional, sem dependências ocultas e sem ambiguidade dinâmica.

DSLJS é indicado para:

- Criação de mini-linguagens internas
- Redução de boilerplate repetitivo
- Modelagem declarativa de estruturas
- Geração determinística de código
- Metaprogramação controlada em tempo de compilação

O arquivo permanece sendo JavaScript expandido, mas com a capacidade de declarar sua própria gramática quando necessário.
# Anatomia Gráfica de um Macro 

Exemplo autoral:

$macro MODEL $nome (
        $($campo : $valor)...
    )
#(
    const $nome = {
        $($campo: $valor,)...
    }
)#

A seguir, a explicação orgânica dos elementos.

---

# 1. $macro — Ponto Fixo

┌────────────┐
│  $macro    │  ← único token estrutural fixo
└──────┬─────┘
       ↓
   inicia definição

Tudo após isso, até #( )#, é padrão livre.

---

# 2. $nome — Captura Simples

Trecho:

MODEL $nome (...)

Representação:

Entrada do usuário:
MODEL Usuario (...)

Captura:
$nome = Usuario

Visual:

Usuário escreve
        ↓
$nome captura identificador
        ↓
Substituição no bloco #( )#

---

# 3. $( ... ) — Grupo Estrutural

Trecho:

$($campo : $valor)...

Representação gráfica:

┌──────── Grupo ─────────┐
│ $campo : $valor        │
└─────────────────────────┘

Significa:

- $campo captura identificador
- $valor captura expressão
- O grupo inteiro é tratado como unidade estrutural

---

# 4. ... — Repetição Variádica

Trecho:

$( $campo : $valor )...

Visual:

campo1 : v1  
campo2 : v2  
campo3 : v3  

↓

Captura interna:

$campo = [campo1, campo2, campo3]  
$valor = [v1, v2, v3]

Sem ... → captura única  
Com ... → captura múltipla

---

# 5. Delimitadores ( ), [ ], { }

No exemplo:

MODEL $nome ( ... )

Os parênteses são apenas delimitadores escolhidos pelo autor.

Eles:

- não são obrigatórios
- não são palavra-chave
- apenas organizam o padrão

Poderia ser:

MODEL $nome [ ... ]
MODEL $nome { ... }
MODEL $nome << ... >>

A DSL permite modelagem livre.

---

# 6. #( )# — Domínio JavaScript

Trecho:

#(
    const $nome = {
        $($campo: $valor,)...
    }
)#

Representação:

ANTES de #( )#
┌──────────────────────────────┐
│ Gramática criada pelo autor  │
│ Padrão estrutural livre      │
└──────────────────────────────┘

DENTRO de #( )#
┌──────────────────────────────┐
│ JavaScript real              │
│ Substituição acontece aqui   │
└──────────────────────────────┘

---

# 7. S-Expression Dentro de Template Literal

Se usado:

$`modelo_${$nome}`

Representação:

Template Semântico
┌──────────────────────────────┐
│ texto_${expressão}          │
└──────────────────────────────┘

Fluxo:

Captura → Avaliação estrutural → Geração literal final

---

# 8. Fluxo Completo do Macro

Definição
        ↓
Entrada do Usuário
        ↓
Comparação com Padrão
        ↓
Captura de $símbolos
        ↓
Aplicação de $( ) e ...
        ↓
Expansão dentro de #( )#
        ↓
JavaScript final

---

# Modelo Mental Final

Antes de #( )#:
Você está declarando uma gramática.

Depois de #( )#:
Você está gerando JavaScript.

Os elementos fundamentais que tornam isso possível são:

$identificador → captura  
$( ... ) → agrupamento estrutural  
... → repetição variádica  
delimitadores → organização visual  
#( )# → domínio de geração  

Tudo antes de #( )# é modelagem estrutural livre.
---

# Instalação
```
npm install dsljs
```
---

# Uso com Vite

DSLJS fornece um plugin oficial para Vite.

## vite.config.js
```
import { defineConfig } from "vite";
import dsljs from "dsljs/vite";

export default defineConfig({
  plugins: [dsljs()]
});
```
Arquivos com extensão .dsljs serão:

1. Carregados pelo plugin  
2. Terão o bloco de macros extraído  
3. Terão as macros parseadas  
4. Serão expandidos  
5. Retornarão JavaScript válido para o bundler  

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

# Configuração Obrigatória no VSCode (por projeto)

Crie a pasta .vscode na raiz do projeto e adicione um arquivo settings.json com o conteúdo abaixo.

Estrutura:

.projeto/
├── .vscode/
│   └── settings.json

Conteúdo do .vscode/settings.json:

{
    "files.associations": {
        "*.dsl.js": "javascript"
    },
    "[javascript]": {
        "editor.semanticHighlighting.enabled": true
    },
    "javascript.validate.enable": false
}

Essa configuração é aplicada apenas ao projeto atual e evita erros de LSP causados por macros antes da expansão.

---

# Observações Importantes

- DSLJS opera em tempo de compilação.
- O código gerado é JavaScript puro.
- Não existe runtime específico da DSL.
- Validações do TypeScript devem ser desativadas para evitar falsos erros causados por macros antes da expansão.

macros: {
    // Macro para instanciar objetos do THREE.js com suporte a argumentos ou propriedades

    $macro THREE $a.$b[$delim...] #(
        const $a = new THREE.$b$delim
    )#

    $macro LOG $msg #(
        console.log("[Macro Log]:", $msg);
    )#

    $macro ASSIGN $a = $b #(
        function $a $b
    )#

    $macro style ($text) #(
        console.log($text)
    )#

    $macro struct $name [
        $($attr : $val1),
        $declarações
    ] => {
        $($prop = $value)...
    }
    #(
        const $name = function(){
            const $`${$attr}_var` = $val1;
            const teste_1 = $declarações[0];
            return {
                $attr: () => $`${$attr}_var`,
                $($prop: $value,)...
            }
        }
    )#

}



THREE scene.Scene()

THREE camera.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)

if(true){
    THREE mesh.BoxGeometry[0]
}

LOG `Build completo com ${$(THREE scene.Scene())}`

const lista_qualquer = [1,2,3,4]

struct teste [
    atributo: "teste_atributo",
    lista_qualquer
] => {
    propriedade = "valor teste"
}


style (/*css*/`
    #mapa_container {
        width: 100vw;
        height: 100vh;
    }
    #mapa_container > img {
        position: absolute;
        width: 100%;
        height: 100%
    }
`)
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

    $macro struct $name [
        $($attr : $val1)... 
    ] => {
        $($prop = $value)...
    }
    #(
        const $name = function(){
            const $`${$attr}_var` = $val1
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

LOG `Build completo com ${scene}`

struct teste [
    atributo: "teste_atributo"
] => {
    propriedade = "valor teste"
}
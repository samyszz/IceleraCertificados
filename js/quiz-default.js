/**
 * Questionários PADRÃO por equipamento.
 *
 * Usados só na primeira vez: depois que alguém salva um questionário na tela
 * "Questionários", a versão salva no banco passa a valer.
 *
 * ⚠️ As perguntas abaixo são EXEMPLOS, montadas a partir do conteúdo programático.
 *    Revise com a equipe antes de usar com clientes.
 *
 * Este arquivo é usado pelo frontend (modo demonstração) e pelo backend.
 *   correct = índice da alternativa certa (0 = primeira)
 */
(function (root) {
  const QUIZ_DEFAULTS = {
    passPercent: 70,   // nota mínima para aprovação (%)
    maxAttempts: 3,    // tentativas por treinado (0 = ilimitado)

    byEquipment: {
      "Nano Poli": [
        {
          text: "No sistema internacional 10-20, os números 10 e 20 se referem a:",
          options: [
            "Distâncias em centímetros entre os eletrodos",
            "Percentuais das distâncias entre pontos de referência do crânio",
            "Quantidade mínima e máxima de eletrodos",
            "Tempo em minutos de preparação do paciente"
          ],
          correct: 1
        },
        {
          text: "Antes de fixar os eletrodos, a pele do paciente deve ser:",
          options: [
            "Limpa e preparada para reduzir a impedância",
            "Hidratada com creme para melhorar a aderência",
            "Mantida como está, sem nenhuma preparação",
            "Coberta com fita antes do eletrodo"
          ],
          correct: 0
        },
        {
          text: "Qual é o principal objetivo de verificar a impedância dos eletrodos antes do exame?",
          options: [
            "Medir a frequência cardíaca do paciente",
            "Garantir um bom contato e um sinal de qualidade",
            "Calibrar a data e hora do equipamento",
            "Carregar a bateria do equipamento"
          ],
          correct: 1
        },
        {
          text: "Após o exame, qual é a forma correta de limpar os eletrodos?",
          options: [
            "Guardar com a pasta, para reaproveitar no próximo exame",
            "Remover a pasta com água morna e secar bem antes de guardar",
            "Esfregar com palha de aço",
            "Mergulhar em álcool por 24 horas"
          ],
          correct: 1
        },
        {
          text: "No software, o que deve ser feito antes de iniciar a gravação de um exame?",
          options: [
            "Cadastrar o paciente e conferir se todos os canais estão com sinal",
            "Desligar o computador para liberar memória",
            "Apagar os exames anteriores",
            "Nada, basta ligar o equipamento"
          ],
          correct: 0
        }
      ],

      "Nano EEG": [
        {
          text: "No sistema internacional 10-20, os eletrodos com número ímpar ficam:",
          options: [
            "No lado direito da cabeça",
            "No lado esquerdo da cabeça",
            "Na linha média",
            "Atrás das orelhas"
          ],
          correct: 1
        },
        {
          text: "Os eletrodos com a letra \"z\" (ex.: Cz, Fz, Pz) ficam posicionados:",
          options: [
            "Na linha média, entre os hemisférios",
            "Sobre as orelhas",
            "No queixo",
            "No peito"
          ],
          correct: 0
        },
        {
          text: "Qual cuidado ajuda a obter um sinal de EEG limpo?",
          options: [
            "Cabelo e couro cabeludo limpos, sem óleos ou cremes",
            "Aplicar gel de cabelo antes do exame",
            "Manter o paciente com fones de ouvido ligados",
            "Deixar os cabos enrolados e tensionados"
          ],
          correct: 0
        },
        {
          text: "Após o exame, os eletrodos devem ser:",
          options: [
            "Guardados ainda úmidos",
            "Limpos, sem resíduos de pasta, e secos antes de guardar",
            "Descartados após cada uso",
            "Lavados na máquina de lavar"
          ],
          correct: 1
        },
        {
          text: "No software, onde o exame deve ser associado antes da gravação?",
          options: [
            "Ao cadastro do paciente",
            "A uma pasta qualquer do computador",
            "Ao último exame realizado",
            "Não é necessário associar"
          ],
          correct: 0
        }
      ],

      "Apneia Care": [
        {
          text: "Antes de entregar o equipamento ao paciente, o técnico deve:",
          options: [
            "Conferir carga/bateria, sensores e o cadastro do paciente",
            "Apenas ligar o equipamento",
            "Apagar a memória sem verificar nada",
            "Retirar todos os sensores"
          ],
          correct: 0
        },
        {
          text: "Qual orientação é importante passar ao paciente que vai usar o equipamento em casa?",
          options: [
            "Que pode tirar os sensores quando quiser, sem avisar",
            "Como colocar, ligar e retirar o equipamento corretamente",
            "Que não precisa dormir durante o exame",
            "Que deve molhar os sensores antes de usar"
          ],
          correct: 1
        },
        {
          text: "Na preparação do paciente, os sensores devem ficar:",
          options: [
            "Soltos, para não incomodar",
            "Bem posicionados e fixados, sem apertar demais",
            "Guardados na caixa até de manhã",
            "Sobre a roupa"
          ],
          correct: 1
        },
        {
          text: "No software, o que se faz quando o paciente devolve o equipamento?",
          options: [
            "Descarrega/importa os dados do exame para análise",
            "Formata o equipamento sem salvar",
            "Nada, os dados são enviados sozinhos para o médico",
            "Cria um novo paciente com os mesmos dados"
          ],
          correct: 0
        },
        {
          text: "Na montagem do equipamento, o mais importante é:",
          options: [
            "Conectar cada sensor na entrada correta",
            "Usar qualquer entrada disponível",
            "Montar sem conferir os cabos",
            "Ligar o equipamento na tomada durante o exame"
          ],
          correct: 0
        }
      ]
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = QUIZ_DEFAULTS;
  else root.ICELERA_QUIZ_DEFAULTS = QUIZ_DEFAULTS;
})(typeof window !== "undefined" ? window : globalThis);

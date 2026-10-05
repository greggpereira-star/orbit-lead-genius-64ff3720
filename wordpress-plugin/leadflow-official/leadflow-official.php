<?php
/**
 * Plugin Name: AltLeadFlow Official
 * Plugin URI: https://www.altleadflow.com.br
 * Description: Formulários, quizzes, chat e WhatsApp do AltLeadFlow no WordPress, com rastreamento de UTMs, gclid, wbraid, gbraid e fbclid.
 * Version: 2.1.0
 * Author: AltLeadFlow
 * Author URI: https://www.altleadflow.com.br
 * License: GPL2
 */

if (!defined('ABSPATH')) {
    exit;
}

class AltLeadFlow_Official {
    const DEFAULT_BASE_URL = 'https://www.altleadflow.com.br';
    const VERSION = '2.1.0';

    public function __construct() {
        add_shortcode('leadflow_form', [$this, 'render_form_shortcode']);
        add_shortcode('altleadflow_form', [$this, 'render_form_shortcode']);
        add_shortcode('altleadflow_quiz', [$this, 'render_quiz_shortcode']);

        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);
        add_action('wp_footer', [$this, 'render_footer_widgets']);
        add_action('admin_menu', [$this, 'add_settings_page']);
        add_action('admin_init', [$this, 'register_settings']);
    }

    private function base_url() {
        $url = get_option('altleadflow_base_url', self::DEFAULT_BASE_URL);
        return untrailingslashit($url ?: self::DEFAULT_BASE_URL);
    }

    public function enqueue_scripts() {
        wp_enqueue_script('altleadflow-sdk', $this->base_url() . '/sdk.js', [], self::VERSION, true);
        wp_add_inline_style('wp-block-library', '
            .altleadflow-embed { width:100%; margin:20px 0; }
            .altleadflow-embed iframe { border:0; width:100%; transition:opacity .3s ease; }
            .altleadflow-alternativa { display:block; padding:14px 18px; border:1px solid #e3e9f2;
                border-radius:10px; text-align:center; font-weight:600; text-decoration:none; }
        ');
    }

    /**
     * Formulário embutido.
     *
     * A versão 2.0.0 montava um `<script>` inline com
     * `if (window.LeadFlow) { LeadFlow.init(...) }`. Dois problemas:
     *
     *   1. Se o SDK não tivesse carregado, o bloco não renderizava NADA — sem
     *      erro, sem aviso. O visitante via um espaço em branco e o cliente não
     *      tinha como descobrir o motivo.
     *   2. `LeadFlow.init({target})` é o caminho antigo. O `data-lf-form` é
     *      observado por `MutationObserver`, que é o que faz funcionar quando a
     *      página é montada depois do carregamento — exatamente o caso do
     *      Elementor e de qualquer construtor visual.
     *
     * Agora é só o atributo, e existe uma alternativa visível se o SDK falhar.
     */
    public function render_form_shortcode($atts) {
        $a = shortcode_atts([
            'id'     => '',
            'mode'   => 'inline',   // inline | botao
            'label'  => 'Fale com a gente',
            'height' => '',
        ], $atts);

        if (empty($a['id'])) {
            return '<!-- AltLeadFlow: falta o id do formulário no shortcode -->';
        }

        $form_id = esc_attr($a['id']);
        $base    = esc_url($this->base_url());
        $link    = $base . '/embed-form/' . rawurlencode($a['id']);

        if ($a['mode'] === 'botao') {
            return '<a href="' . esc_url($link) . '" data-lf-open="' . $form_id . '"'
                . ' class="altleadflow-abrir">' . esc_html($a['label']) . '</a>';
        }

        $alt_id = 'lf-alt-' . substr(md5($form_id), 0, 8);

        ob_start(); ?>
        <div class="altleadflow-embed">
            <div data-lf-form="<?php echo $form_id; ?>"></div>
            <noscript>
                <a class="altleadflow-alternativa" href="<?php echo esc_url($link); ?>" target="_blank" rel="noopener">
                    <?php echo esc_html($a['label']); ?>
                </a>
            </noscript>
            <div id="<?php echo esc_attr($alt_id); ?>" style="display:none">
                <a class="altleadflow-alternativa" href="<?php echo esc_url($link); ?>" target="_blank" rel="noopener">
                    <?php echo esc_html($a['label']); ?>
                </a>
            </div>
        </div>
        <script>
        /* Alternativa visível. Se em 8 segundos o SDK não tiver renderizado o
           formulário, mostra um link para abri-lo em outra aba. Antes, nesse
           caso, não aparecia nada — e o lead ia embora sem que ninguém soubesse
           que havia um formulário ali. */
        (function () {
            var caixa = document.getElementById(<?php echo wp_json_encode($alt_id); ?>);
            if (!caixa) return;
            setTimeout(function () {
                var pai = caixa.parentNode;
                var pronto = pai && pai.querySelector('[data-lf-form] iframe');
                if (!pronto) caixa.style.display = 'block';
            }, 8000);
        })();
        </script>
        <?php
        return ob_get_clean();
    }

    public function render_quiz_shortcode($atts) {
        $a = shortcode_atts(['slug' => '', 'height' => '760px'], $atts);
        if (empty($a['slug'])) return '<!-- AltLeadFlow: falta o slug do quiz no shortcode -->';
        $src    = esc_url($this->base_url() . '/q/' . rawurlencode($a['slug']));
        $height = esc_attr($a['height']);
        return '<div class="altleadflow-embed"><iframe src="' . $src
            . '" style="width:100%;height:' . $height . ';border:0;" loading="lazy"></iframe></div>';
    }

    public function render_footer_widgets() {
        $company_id = trim(get_option('altleadflow_company_id', ''));
        if (empty($company_id)) return;

        $base = esc_url($this->base_url());
        $cid  = esc_attr($company_id);

        if (get_option('altleadflow_enable_chat', '1') === '1') {
            $chat_color = esc_attr(get_option('altleadflow_chat_color', '#4f46e5'));
            echo '<script src="' . $base . '/chat-widget.js" data-company-id="' . $cid
                . '" data-color="' . $chat_color . '" defer></script>' . "\n";
        }

        if (get_option('altleadflow_enable_whatsapp', '0') === '1') {
            $phone = esc_attr(get_option('altleadflow_wa_phone', ''));
            if (!empty($phone)) {
                echo '<script src="' . $base . '/whatsapp-widget.js"'
                    . ' data-company-id="' . $cid . '"'
                    . ' data-phone="' . $phone . '"'
                    . ' data-message="' . esc_attr(get_option('altleadflow_wa_message', 'Olá! Vim pelo site.')) . '"'
                    . ' data-label="' . esc_attr(get_option('altleadflow_wa_label', 'Fale conosco')) . '"'
                    . ' data-color="' . esc_attr(get_option('altleadflow_wa_color', '#25D366')) . '"'
                    . ' data-position="' . esc_attr(get_option('altleadflow_wa_position', 'bottom-right')) . '" defer></script>' . "\n";
            }
        }
    }

    public function add_settings_page() {
        add_menu_page('AltLeadFlow', 'AltLeadFlow', 'manage_options',
            'altleadflow-settings', [$this, 'render_settings_page'], 'dashicons-format-chat', 80);
    }

    public function register_settings() {
        foreach ([
            'altleadflow_base_url', 'altleadflow_company_id',
            'altleadflow_enable_chat', 'altleadflow_chat_color',
            'altleadflow_enable_whatsapp', 'altleadflow_wa_phone', 'altleadflow_wa_message',
            'altleadflow_wa_label', 'altleadflow_wa_color', 'altleadflow_wa_position',
        ] as $o) {
            register_setting('altleadflow_settings_group', $o);
        }
    }

    public function render_settings_page() {
        $base_url   = get_option('altleadflow_base_url', self::DEFAULT_BASE_URL);
        $company_id = get_option('altleadflow_company_id', '');
        $enable_chat = get_option('altleadflow_enable_chat', '1');
        $chat_color  = get_option('altleadflow_chat_color', '#4f46e5');
        $enable_wa   = get_option('altleadflow_enable_whatsapp', '0');
        $wa_phone    = get_option('altleadflow_wa_phone', '');
        $wa_message  = get_option('altleadflow_wa_message', 'Olá! Vim pelo site.');
        $wa_label    = get_option('altleadflow_wa_label', 'Fale conosco');
        $wa_color    = get_option('altleadflow_wa_color', '#25D366');
        $wa_position = get_option('altleadflow_wa_position', 'bottom-right');
        ?>
        <div class="wrap">
            <h1>AltLeadFlow — Configurações</h1>
            <form method="post" action="options.php">
                <?php settings_fields('altleadflow_settings_group'); ?>
                <h2>Conta</h2>
                <table class="form-table">
                    <tr><th scope="row">Endereço do painel</th>
                        <td><input type="text" name="altleadflow_base_url" value="<?php echo esc_attr($base_url); ?>" class="regular-text" />
                        <p class="description">Padrão: <code><?php echo esc_html(self::DEFAULT_BASE_URL); ?></code></p></td></tr>
                    <tr><th scope="row">ID da empresa</th>
                        <td><input type="text" name="altleadflow_company_id" value="<?php echo esc_attr($company_id); ?>" class="regular-text" placeholder="deixe vazio para não carregar chat nem WhatsApp" />
                        <p class="description">Só preencha se for usar o chat ou o botão de WhatsApp. Vazio, nenhum dos dois é carregado.</p></td></tr>
                </table>

                <h2>Chat ao vivo</h2>
                <table class="form-table">
                    <tr><th scope="row">Habilitar chat</th>
                        <td><label><input type="checkbox" name="altleadflow_enable_chat" value="1" <?php checked($enable_chat, '1'); ?> /> Exibir em todas as páginas</label></td></tr>
                    <tr><th scope="row">Cor do botão</th>
                        <td><input type="text" name="altleadflow_chat_color" value="<?php echo esc_attr($chat_color); ?>" class="regular-text" /></td></tr>
                </table>

                <h2>WhatsApp</h2>
                <table class="form-table">
                    <tr><th scope="row">Habilitar WhatsApp</th>
                        <td><label><input type="checkbox" name="altleadflow_enable_whatsapp" value="1" <?php checked($enable_wa, '1'); ?> /> Exibir botão flutuante</label></td></tr>
                    <tr><th scope="row">Telefone</th>
                        <td><input type="text" name="altleadflow_wa_phone" value="<?php echo esc_attr($wa_phone); ?>" class="regular-text" placeholder="5527999999999" /></td></tr>
                    <tr><th scope="row">Mensagem inicial</th>
                        <td><input type="text" name="altleadflow_wa_message" value="<?php echo esc_attr($wa_message); ?>" class="regular-text" /></td></tr>
                    <tr><th scope="row">Rótulo</th>
                        <td><input type="text" name="altleadflow_wa_label" value="<?php echo esc_attr($wa_label); ?>" class="regular-text" /></td></tr>
                    <tr><th scope="row">Cor</th>
                        <td><input type="text" name="altleadflow_wa_color" value="<?php echo esc_attr($wa_color); ?>" class="regular-text" /></td></tr>
                    <tr><th scope="row">Posição</th>
                        <td><select name="altleadflow_wa_position">
                            <?php foreach (['bottom-right' => 'Inferior direita', 'bottom-left' => 'Inferior esquerda'] as $k => $v): ?>
                                <option value="<?php echo esc_attr($k); ?>" <?php selected($wa_position, $k); ?>><?php echo esc_html($v); ?></option>
                            <?php endforeach; ?>
                        </select></td></tr>
                </table>
                <?php submit_button(); ?>
            </form>

            <hr />
            <h2>Como usar</h2>
            <p><strong>Formulário na página:</strong> <code>[altleadflow_form id="ID_DO_FORMULARIO"]</code></p>
            <p><strong>Botão que abre em janela:</strong> <code>[altleadflow_form id="ID" mode="botao" label="Fale com um consultor"]</code></p>
            <p><strong>Qualquer botão do tema:</strong> adicione <code>data-lf-open="ID_DO_FORMULARIO"</code> ao link ou botão.</p>
            <p><strong>Quiz:</strong> <code>[altleadflow_quiz slug="SLUG"]</code></p>
            <p>UTMs, <code>gclid</code>, <code>wbraid</code>, <code>gbraid</code> e <code>fbclid</code> da página são capturados junto com o lead.</p>
        </div>
        <?php
    }
}

new AltLeadFlow_Official();

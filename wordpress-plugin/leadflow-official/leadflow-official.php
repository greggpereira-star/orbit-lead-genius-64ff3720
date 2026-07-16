<?php
/**
 * Plugin Name: AltLeadFlow Official
 * Plugin URI: https://www.altleadflow.com.br
 * Description: Integração completa AltLeadFlow para WordPress — formulários, quizzes, chat ao vivo e widget de WhatsApp com rastreamento de UTMs, fbclid, gclid e Meta CAPI.
 * Version: 2.0.0
 * Author: AltLeadFlow
 * Author URI: https://www.altleadflow.com.br
 * License: GPL2
 */

if (!defined('ABSPATH')) {
    exit;
}

class AltLeadFlow_Official {
    const DEFAULT_BASE_URL = 'https://www.altleadflow.com.br';

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
        wp_enqueue_script('altleadflow-sdk', $this->base_url() . '/sdk.js', [], '2.0.0', true);
        wp_add_inline_style('wp-block-library', '
            .leadflow-form-container,.altleadflow-embed { width:100%; margin:20px 0; min-height:400px; }
            .leadflow-form-container iframe,.altleadflow-embed iframe { transition:opacity .3s ease; border:0; width:100%; }
        ');
    }

    public function render_form_shortcode($atts) {
        $a = shortcode_atts([
            'id' => '',
            'mode' => 'inline',
            'height' => '700px',
        ], $atts);
        if (empty($a['id'])) return '<!-- AltLeadFlow: form id missing -->';

        $form_id = esc_attr($a['id']);
        $mode = esc_attr($a['mode']);
        $height = esc_attr($a['height']);
        $target = 'altleadflow-form-' . $form_id;

        ob_start(); ?>
        <div id="<?php echo $target; ?>" class="leadflow-form-container altleadflow-embed"></div>
        <script>
            window.addEventListener('load', function () {
                if (window.LeadFlow) {
                    LeadFlow.init({
                        formId: "<?php echo $form_id; ?>",
                        target: "#<?php echo $target; ?>",
                        mode: "<?php echo $mode; ?>",
                        height: "<?php echo $height; ?>"
                    });
                }
            });
        </script>
        <?php
        return ob_get_clean();
    }

    public function render_quiz_shortcode($atts) {
        $a = shortcode_atts(['slug' => '', 'height' => '760px'], $atts);
        if (empty($a['slug'])) return '<!-- AltLeadFlow: quiz slug missing -->';
        $slug = esc_attr($a['slug']);
        $height = esc_attr($a['height']);
        $src = esc_url($this->base_url() . '/q/' . $slug);
        return '<div class="altleadflow-embed"><iframe src="' . $src . '" style="width:100%;height:' . $height . ';border:0;" loading="lazy"></iframe></div>';
    }

    public function render_footer_widgets() {
        $company_id = trim(get_option('altleadflow_company_id', ''));
        if (empty($company_id)) return;

        $base = esc_url($this->base_url());
        $cid = esc_attr($company_id);

        // Chat widget
        if (get_option('altleadflow_enable_chat', '1') === '1') {
            $chat_color = esc_attr(get_option('altleadflow_chat_color', '#4f46e5'));
            echo '<script src="' . $base . '/chat-widget.js" data-company-id="' . $cid . '" data-color="' . $chat_color . '" defer></script>' . "\n";
        }

        // WhatsApp widget
        if (get_option('altleadflow_enable_whatsapp', '0') === '1') {
            $phone = esc_attr(get_option('altleadflow_wa_phone', ''));
            if (!empty($phone)) {
                $message = esc_attr(get_option('altleadflow_wa_message', 'Olá! Vim pelo site.'));
                $label = esc_attr(get_option('altleadflow_wa_label', 'Fale conosco'));
                $color = esc_attr(get_option('altleadflow_wa_color', '#25D366'));
                $position = esc_attr(get_option('altleadflow_wa_position', 'bottom-right'));
                echo '<script src="' . $base . '/whatsapp-widget.js"'
                    . ' data-company-id="' . $cid . '"'
                    . ' data-phone="' . $phone . '"'
                    . ' data-message="' . $message . '"'
                    . ' data-label="' . $label . '"'
                    . ' data-color="' . $color . '"'
                    . ' data-position="' . $position . '" defer></script>' . "\n";
            }
        }
    }

    public function add_settings_page() {
        add_menu_page(
            'AltLeadFlow',
            'AltLeadFlow',
            'manage_options',
            'altleadflow-settings',
            [$this, 'render_settings_page'],
            'dashicons-format-chat',
            80
        );
    }

    public function register_settings() {
        $opts = [
            'altleadflow_base_url', 'altleadflow_company_id',
            'altleadflow_enable_chat', 'altleadflow_chat_color',
            'altleadflow_enable_whatsapp', 'altleadflow_wa_phone', 'altleadflow_wa_message',
            'altleadflow_wa_label', 'altleadflow_wa_color', 'altleadflow_wa_position',
        ];
        foreach ($opts as $o) register_setting('altleadflow_settings_group', $o);
    }

    public function render_settings_page() {
        $base_url = get_option('altleadflow_base_url', self::DEFAULT_BASE_URL);
        $company_id = get_option('altleadflow_company_id', '');
        $enable_chat = get_option('altleadflow_enable_chat', '1');
        $chat_color = get_option('altleadflow_chat_color', '#4f46e5');
        $enable_wa = get_option('altleadflow_enable_whatsapp', '0');
        $wa_phone = get_option('altleadflow_wa_phone', '');
        $wa_message = get_option('altleadflow_wa_message', 'Olá! Vim pelo site.');
        $wa_label = get_option('altleadflow_wa_label', 'Fale conosco');
        $wa_color = get_option('altleadflow_wa_color', '#25D366');
        $wa_position = get_option('altleadflow_wa_position', 'bottom-right');
        ?>
        <div class="wrap">
            <h1>AltLeadFlow — Configurações</h1>
            <p>Instale chat ao vivo, WhatsApp rastreável e formulários AltLeadFlow em qualquer página do seu WordPress.</p>
            <form method="post" action="options.php">
                <?php settings_fields('altleadflow_settings_group'); ?>

                <h2>Conta</h2>
                <table class="form-table">
                    <tr><th scope="row">Base URL</th>
                        <td><input type="text" name="altleadflow_base_url" value="<?php echo esc_attr($base_url); ?>" class="regular-text" />
                        <p class="description">Padrão: <code><?php echo esc_html(self::DEFAULT_BASE_URL); ?></code></p></td></tr>
                    <tr><th scope="row">Company ID</th>
                        <td><input type="text" name="altleadflow_company_id" value="<?php echo esc_attr($company_id); ?>" class="regular-text" placeholder="UUID da sua empresa" />
                        <p class="description">Encontre em <em>Configurações → Widgets do site</em> no painel AltLeadFlow.</p></td></tr>
                </table>

                <h2>Chat ao vivo</h2>
                <table class="form-table">
                    <tr><th scope="row">Habilitar chat</th>
                        <td><label><input type="checkbox" name="altleadflow_enable_chat" value="1" <?php checked($enable_chat, '1'); ?> /> Exibir botão de chat em todas as páginas</label></td></tr>
                    <tr><th scope="row">Cor do botão</th>
                        <td><input type="text" name="altleadflow_chat_color" value="<?php echo esc_attr($chat_color); ?>" class="regular-text" placeholder="#4f46e5" /></td></tr>
                </table>

                <h2>WhatsApp</h2>
                <table class="form-table">
                    <tr><th scope="row">Habilitar WhatsApp</th>
                        <td><label><input type="checkbox" name="altleadflow_enable_whatsapp" value="1" <?php checked($enable_wa, '1'); ?> /> Exibir botão flutuante do WhatsApp</label></td></tr>
                    <tr><th scope="row">Telefone (DDI+DDD+número)</th>
                        <td><input type="text" name="altleadflow_wa_phone" value="<?php echo esc_attr($wa_phone); ?>" class="regular-text" placeholder="5511999999999" /></td></tr>
                    <tr><th scope="row">Mensagem inicial</th>
                        <td><input type="text" name="altleadflow_wa_message" value="<?php echo esc_attr($wa_message); ?>" class="regular-text" /></td></tr>
                    <tr><th scope="row">Rótulo do botão</th>
                        <td><input type="text" name="altleadflow_wa_label" value="<?php echo esc_attr($wa_label); ?>" class="regular-text" /></td></tr>
                    <tr><th scope="row">Cor</th>
                        <td><input type="text" name="altleadflow_wa_color" value="<?php echo esc_attr($wa_color); ?>" class="regular-text" placeholder="#25D366" /></td></tr>
                    <tr><th scope="row">Posição</th>
                        <td><select name="altleadflow_wa_position">
                            <?php foreach (['bottom-right' => 'Inferior direita', 'bottom-left' => 'Inferior esquerda'] as $k => $v): ?>
                                <option value="<?php echo $k; ?>" <?php selected($wa_position, $k); ?>><?php echo $v; ?></option>
                            <?php endforeach; ?>
                        </select></td></tr>
                </table>

                <?php submit_button(); ?>
            </form>

            <hr />
            <h2>Shortcodes</h2>
            <p><strong>Formulário:</strong> <code>[altleadflow_form id="FORM_ID"]</code></p>
            <p><strong>Quiz:</strong> <code>[altleadflow_quiz slug="SLUG_DO_QUIZ"]</code></p>
            <p>UTMs, <code>fbclid</code>, <code>gclid</code> e clicks de WhatsApp são rastreados automaticamente e enviados para o Meta CAPI quando configurado.</p>
        </div>
        <?php
    }
}

new AltLeadFlow_Official();

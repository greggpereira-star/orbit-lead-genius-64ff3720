<?php
/**
 * Plugin Name: LeadFlow Official
 * Plugin URI: https://altflowlead.lovable.app
 * Description: Integre seus formulários LeadFlow de forma simples e profissional no seu site WordPress.
 * Version: 1.0.0
 * Author: LeadFlow Team
 * Author URI: https://altflowlead.lovable.app
 * License: GPL2
 */

if (!defined('ABSPATH')) {
    exit;
}

class LeadFlow_Official {
    private $base_url = 'https://altflowlead.lovable.app';

    public function __construct() {
        add_shortcode('leadflow_form', [$this, 'render_shortcode']);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);
        add_action('admin_menu', [$this, 'add_settings_page']);
        add_action('admin_init', [$this, 'register_settings']);
    }

    public function enqueue_scripts() {
        wp_enqueue_script('leadflow-sdk', $this->base_url . '/sdk.js', [], '1.1.0', true);
    }

    public function render_shortcode($atts) {
        $a = shortcode_atts([
            'id' => '',
            'mode' => 'inline',
            'height' => '700px'
        ], $atts);

        if (empty($a['id'])) {
            return '<!-- LeadFlow: Form ID missing -->';
        }

        $form_id = esc_attr($a['id']);
        $mode = esc_attr($a['mode']);
        $height = esc_attr($a['height']);
        $target_id = 'leadflow-form-' . $form_id;

        ob_start();
        ?>
        <div id="<?php echo $target_id; ?>" class="leadflow-form-container"></div>
        <script>
            window.addEventListener('load', function() {
                if (window.LeadFlow) {
                    LeadFlow.init({
                        formId: "<?php echo $form_id; ?>",
                        target: "#<?php echo $target_id; ?>",
                        mode: "<?php echo $mode; ?>",
                        height: "<?php echo $height; ?>"
                    });
                }
            });
        </script>
        <?php
        return ob_get_clean();
    }

    public function add_settings_page() {
        add_options_page(
            'LeadFlow Settings',
            'LeadFlow',
            'manage_options',
            'leadflow-settings',
            [$this, 'render_settings_page']
        );
    }

    public function register_settings() {
        register_setting('leadflow_settings_group', 'leadflow_base_url');
    }

    public function render_settings_page() {
        $current_url = get_option('leadflow_base_url', $this->base_url);
        ?>
        <div class="wrap">
            <h1>Configurações LeadFlow</h1>
            <form method="post" action="options.php">
                <?php settings_fields('leadflow_settings_group'); ?>
                <?php do_settings_sections('leadflow_settings_group'); ?>
                <table class="form-table">
                    <tr valign="top">
                        <th scope="row">Base URL do LeadFlow</th>
                        <td>
                            <input type="text" name="leadflow_base_url" value="<?php echo esc_attr($current_url); ?>" class="regular-text" />
                            <p class="description">URL da sua instância LeadFlow (ex: https://altflowlead.lovable.app)</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
            
            <hr />
            <h2>Como usar</h2>
            <p>Use o shortcode abaixo em qualquer página ou post:</p>
            <code>[leadflow_form id="SEU_ID_AQUI"]</code>
            <p>Você pode encontrar o ID do formulário na aba "Publicar" dentro do LeadFlow.</p>
        </div>
        <?php
    }
}

new LeadFlow_Official();

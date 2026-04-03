<?php
// proxy.php - simple proxy to Apps Script with CORS headers
// Edit $appsScriptUrl below to your Apps Script /exec URL before uploading.

header("Access-Control-Allow-Origin: *"); // change '*' to 'https://yourdomain.com' for security
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

// Paste your Apps Script /exec URL here
$appsScriptUrl = https://script.google.com/macros/s/AKfycbwfs9DgMak8AdGGQC-JWy2Px591owTybI-QcaMeYz19fOc5wt2EgSIiL1VkO8xaBOpOIQ/exec
// Read incoming JSON body
$body = file_get_contents('php://input');
$payload = json_decode($body, true);
if (!is_array($payload)) $payload = [];

// Forward to Apps Script using POST with JSON body
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $appsScriptUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
$response = curl_exec($ch);
$err = curl_error($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($err) {
  http_response_code(502);
  header('Content-Type: application/json');
  echo json_encode(array('ok'=>false,'error'=>'proxy error: '.$err));
} else {
  http_response_code($httpCode ? $httpCode : 200);
  header('Content-Type: application/json');
  echo $response;
}
